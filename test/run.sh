#!/usr/bin/env bash
# End-to-end test of Tell's inbound-digest PRODUCER (bin/deliver) — including the
# append / ratchet-resume path that make-fixtures (genesis-only) cannot exercise.
# Where a data-pile checkout is available it cross-checks the produced chain with
# the REAL consumer (data-pile bin/verify / bin/prove), proving producer and
# consumer agree. Runs fully offline.
#
#   DP_REPO=path/to/data-pile  test/run.sh   # default: ../data-pile if present
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }

command -v ssh-keygen >/dev/null 2>&1 || fail "ssh-keygen required for the signing path"

# Tell keys: one age identity (ratchet resume) + one ssh signer (manifest head).
age-keygen -o "$work/tell-id.txt" 2>/dev/null
export TELL_IDENTITY_FILE="$work/tell-id.txt"
ssh-keygen -t ed25519 -N '' -C tell-signer -f "$work/sign" >/dev/null
# Pile (owner) recipient.
age-keygen -o "$work/pile-id.txt" 2>/dev/null
recip="$(age-keygen -y "$work/pile-id.txt")"

feed="$work/feed"

echo "[1] genesis delivery (2 blocks)"
printf 'alpha\n' > "$work/b0"; printf 'bravo\n' > "$work/b1"
bin/deliver --dir "$feed" --recipient "$recip" --signkey "$work/sign" \
  --block "$work/b0" --block "$work/b1" >/dev/null
[ -f "$feed/inbox/seed.age" ] && [ -f "$feed/inbox/seed.tell.age" ] || fail "genesis missing seed files"
[ "$(jq -r '.head.seq' "$feed/inbox/manifest.json")" = 1 ] || fail "genesis head seq != 1"
ok "genesis wrote seq 0..1 + owner/tell seeds"

echo "[2] resume delivery in a FRESH process (ratchet replayed from seed.tell.age)"
printf 'charlie\n' > "$work/b2"
bin/deliver --dir "$feed" --signkey "$work/sign" --block "$work/b2" >/dev/null
[ "$(jq -r '.head.seq' "$feed/inbox/manifest.json")" = 2 ] || fail "resume head seq != 2"
[ "$(jq -r '[.entries[].seq]|@csv' "$feed/inbox/manifest.json")" = '0,1,2' ] || fail "seqs not contiguous"
ok "resume appended seq 2 onto the existing chain"

echo "[3] chain self-consistency (prev_hash links + ratchet_pub commitments)"
. bin/pile-lib.sh
prev=null; i=0
while [ "$i" -lt 3 ]; do
  ph="$(jq -r ".entries[$i].prev_hash // \"null\"" "$feed/inbox/manifest.json")"
  [ "$ph" = "$prev" ] || fail "prev_hash break at seq $i"
  prev="$(jq -r ".entries[$i].this_hash" "$feed/inbox/manifest.json")"
  i=$((i+1))
done
ok "hash chain links seq 0→1→2"

# Cross-repo: verify with the real consumer if a data-pile checkout is reachable.
DP_REPO="${DP_REPO:-$root/../data-pile}"

# Drift guard: our vendored crypto core must match data-pile's byte-for-byte, or the
# producer and consumer would silently disagree. Check against the local checkout when
# present (offline); CI without one can run bin/check-pile-lib against the GitHub raw source.
if [ -f "$DP_REPO/bin/lib.sh" ]; then
  echo "[3b] vendored crypto core matches data-pile (no protocol drift)"
  DP_LIB="$DP_REPO/bin/lib.sh" bin/check-pile-lib >/dev/null || fail "pile-lib.sh drifted from data-pile bin/lib.sh"
  ok "bin/pile-lib.sh == data-pile bin/lib.sh"
fi

if [ -x "$DP_REPO/bin/verify" ]; then
  echo "[4] data-pile bin/verify accepts the produced chain"
  printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/tell.signers"
  "$DP_REPO/bin/verify" --dir "$feed" --source tell --signers "$work/tell.signers" >/dev/null \
    || fail "consumer rejected a valid produced chain"
  ok "consumer verifies the full appended chain"

  echo "[5] data-pile bin/verify rejects a tampered block"
  cp -r "$feed" "$work/tampered"; printf 'x' >> "$work/tampered/inbox/000001.enc"
  if "$DP_REPO/bin/verify" --dir "$work/tampered" --source tell --signers "$work/tell.signers" >/dev/null 2>&1; then
    fail "consumer accepted a tampered block"
  fi
  ok "tamper detected across the producer→consumer boundary"

  echo "[6] owner proves blocks 1.. ; earlier block stays sealed"
  DP_IDENTITY_FILE="$work/pile-id.txt" "$DP_REPO/bin/prove" --dir "$feed" --source tell --from 1 >/dev/null
  "$DP_REPO/bin/prove" --dir "$feed" --check "$feed/reports/proof-tell-from-1.json" >/dev/null \
    || fail "checkpoint proof did not verify"
  ok "checkpoint proof verifies against the signed manifest"
else
  echo "[4-6] SKIPPED — no data-pile checkout at \$DP_REPO ($DP_REPO)"
fi

# ── ingress: QR authorization + Issue collection + rollup wiring ──────────────
export TELL_QR_SECRET="$(openssl rand -hex 32)"

echo "[7] poll-bound token round-trips through the ejected authz check"
sub() { jq -n --arg p "$1" --arg poll "$2" --arg r "$3" --arg t "$4" \
  '{pile:$p,poll:$poll,round:$r,type:"open",asker:"x",tok:$t}'; }
tokB="$(bin/qr --pile cd04-q1 --poll budget --round 1 2>/dev/null | sed -n 's/.*[?&]tok=\([0-9a-f]*\).*/\1/p')"
[ -n "$tokB" ] || fail "bin/qr emitted no token"
# Flip the last hex char to a guaranteed-different value (deterministic tamper; "f"
# unless the token already ends in "f", in which case "0"). A fixed "f" would be a
# no-op ~1/16 of the time and falsely "accept a tamper".
tamper="${tokB%?}f"; [ "${tokB: -1}" = f ] && tamper="${tokB%?}0"
sub cd04-q1 budget 1 "$tokB"        | bin/authz 2>/dev/null || fail "authz rejected a valid token"
sub cd04-q1 bikes  1 "$tokB"        | bin/authz 2>/dev/null && fail "authz accepted cross-poll" || true
sub cd04-q1 budget 2 "$tokB"        | bin/authz 2>/dev/null && fail "authz accepted wrong round" || true
sub cd04-q1 budget 1 "$tamper"      | bin/authz 2>/dev/null && fail "authz accepted a tamper"    || true
sub ghost   budget 1 "$tokB"        | bin/authz 2>/dev/null && fail "authz accepted unknown pile" || true
ok "valid tuple accepted; cross-poll / wrong-round / tamper / unknown-pile rejected"

echo "[8] collect stages authorized replies across two polls on one pile"
tokK="$(bin/qr --pile cd04-q1 --poll bikes --round 1 2>/dev/null | sed -n 's/.*[?&]tok=\([0-9a-f]*\).*/\1/p')"
mkb() { jq -n --arg p "$1" --arg poll "$2" --arg t "$3" --arg a "$4" \
  '{schema:"tell.submission/v1",pile:$p,poll:$poll,round:"1",type:"open",asker:"clerk",shown_guidance:"g-\($poll)",tok:$t,answer:$a,ts:"2026-06-25T19:00:00Z"}'; }
fence() { printf '```tell\n%s\n```' "$1"; }
jq -n \
  --arg b1 "$(fence "$(mkb cd04-q1 budget "$tokB" Cut)")" \
  --arg b2 "$(fence "$(mkb cd04-q1 bikes  "$tokK" Yes)")" \
  --arg b3 "$(fence "$(mkb cd04-q1 budget "$tokK" Keep)")" \
  --arg b4 "$(fence "$(mkb ghost  budget "$tokB" Yes)")" \
  --arg b5 "no block here" \
  '[{number:1,body:$b1},{number:2,body:$b2},{number:3,body:$b3},{number:4,body:$b4},{number:5,body:$b5}]' \
  > "$work/issues.json"
TELL_ISSUES_JSON="$work/issues.json" TELL_SUBMISSIONS_DIR="$work/stage" bin/collect-submissions 2>/dev/null
[ "$(wc -l < "$work/stage/.accepted.tsv")" = 2 ] || fail "expected 2 accepted (budget + bikes)"
[ "$(wc -l < "$work/stage/.rejected.tsv")" = 2 ] || fail "expected 2 rejected (cross-poll token + unknown pile)"
ok "2 polls staged, cross-poll forgery + unknown pile rejected, no-block ignored"

echo "[9] govern judges staged answers against constitutions/<pile>/<poll>.json (pre-seal, no key)"
# Real stage (budget=Cut, bikes=Yes — both listed options) gets accepted mechanically and
# annotated in place, so the rollup below seals the verdict into the digest.
rep="$(TELL_SUBMISSIONS_DIR="$work/stage" TELL_REPORTS_DIR="$work/reports" bin/govern)"
[ "$(jq -r '.counts.accept' "$rep")" = 2 ] || fail "govern did not accept the two listed-option answers"
for f in "$work"/stage/cd04-q1/*.json; do
  [ "$(jq -r '.governed' "$f")" = accept ] || fail "govern did not annotate staged record with its verdict"
done
# Synthetic varied stage covers every verdict path against the example constitutions.
gs="$work/gstage/cd04-q1"; mkdir -p "$gs"
mk() { jq -n --argjson n "$1" --arg poll "$2" --arg a "$3" \
  '{number:$n,pile:"cd04-q1",poll:$poll,type:"open",asker:"a",shown_guidance:"g",round:"1",answer:$a,ts:"t"}' > "$gs/$1.json"; }
mk 1 budget Cut            # multichoice listed option   -> accept (auto)
mk 2 budget Maybe          # multichoice write-in, off    -> reject
mk 3 dog-photo "http://x/dog.jpg"  # open                 -> needs-judgment
mk 4 dog-photo ""          # empty                        -> reject
mk 5 mystery hi            # no constitution for poll      -> held
grep="$(TELL_SUBMISSIONS_DIR="$work/gstage" TELL_REPORTS_DIR="$work/reports" bin/govern)"
gv() { jq -r --argjson n "$1" '.records[]|select(.issue==$n)|.verdict' "$grep"; }
[ "$(gv 1)" = accept ]         || fail "listed option not accepted"
[ "$(gv 2)" = reject ]         || fail "write-in (accept_writein:false) not rejected"
[ "$(gv 3)" = needs-judgment ] || fail "open answer not flagged needs-judgment"
[ "$(gv 4)" = reject ]         || fail "empty answer not rejected"
[ "$(gv 5)" = held ]           || fail "no-constitution poll not held"
# TELL_JUDGE_CMD plugs a resolved verdict into the seam.
printf '#!/usr/bin/env bash\njq -n %s\n' "'{verdict:\"accept\",reason:\"stub\"}'" > "$work/yes"; chmod +x "$work/yes"
jrep="$(TELL_JUDGE_CMD="$work/yes" TELL_SUBMISSIONS_DIR="$work/gstage" TELL_REPORTS_DIR="$work/reports" bin/govern)"
[ "$(jq -r '.records[]|select(.issue==3)|.verdict' "$jrep")" = accept ] || fail "TELL_JUDGE_CMD override not honored"
ok "verdicts accept/reject/needs-judgment/held; staged records annotated; judge seam plugs in"

echo "[10] rollup tags each record with its poll, carries the verdict; deliver seals it; consumer verifies"
rb="$work/rollup.block"
TELL_SUBMISSIONS_DIR="$work/stage" bin/rollup cd04-q1 colorado > "$rb"
[ "$(jq -r '.count' "$rb")" = 2 ] || fail "rollup did not batch the 2 accepted answers"
[ "$(jq -r '[.records[].poll]|sort|join(",")' "$rb")" = "bikes,budget" ] || fail "rollup did not tag records by poll"
[ "$(jq -r '[.records[].shown_guidance]|sort|join(",")' "$rb")" = "g-bikes,g-budget" ] || fail "rollup dropped shown_guidance"
[ "$(jq -r '[.records[].governed]|unique|join(",")' "$rb")" = "accept" ] || fail "rollup did not seal the delegated verdict"
bin/deliver --dir "$work/rfeed" --recipient "$recip" --signkey "$work/sign" --block "$rb" >/dev/null \
  || fail "deliver could not seal rollup output"
if [ -x "$DP_REPO/bin/verify" ]; then
  printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/qr.signers"
  "$DP_REPO/bin/verify" --dir "$work/rfeed" --source tell --signers "$work/qr.signers" >/dev/null \
    || fail "consumer rejected the sealed submissions"
  ok "accepted batch sealed + verified end to end"
else
  ok "accepted batch sealed (consumer verify skipped — no \$DP_REPO)"
fi

echo "[11] empty stage => rollup emits nothing (deliver would skip)"
[ -z "$(TELL_SUBMISSIONS_DIR="$work/empty" bin/rollup cd04-q1 colorado)" ] || fail "rollup emitted on empty stage"
ok "no staged submissions -> no block"

if command -v node >/dev/null 2>&1; then
  echo "[12] landing builds a parseable issues/new link"
  node "$root/test/landing.test.mjs" || fail "landing link-builder test failed"
  ok "landing emits a valid prefilled issue link"
else
  echo "[12] SKIPPED — node not available for the landing test"
fi

echo "[13] bin/register emits this Tell's signed registration entry for an Atlas"
# keys/tell.fpr is operator-set (bin/tell-bootstrap); stand in the test signer's REAL
# fingerprint as the published anchor, via the TELL_FPR_FILE seam.
regfpr="$(ssh-keygen -lf "$work/sign.pub" | awk '{print $2}')"
echo "$regfpr" > "$work/tell.fpr"
entry="$(TELL_FPR_FILE="$work/tell.fpr" bin/register entry)"
branch="$(TELL_FPR_FILE="$work/tell.fpr" bin/register branch)"
# Expected identity comes from tell.yml itself, so a copied/edited template still checks out.
tid="$(ruby -ryaml -e 'print YAML.load_file("tell.yml")["id"]')"
tscope="$(ruby -ryaml -e 'print YAML.load_file("tell.yml")["scope"]')"
[ "$branch" = "tell/$tscope/$tid" ] || fail "register branch != tell/<scope>/<id> (got '$branch')"
printf '%s' "$entry" | REGFPR="$regfpr" ruby -ryaml -e '
  e = (YAML.load($stdin.read) || []).first or abort "register entry is not a YAML list"
  %w[id name url scope signer reports].each { |k| (e[k] && e[k].to_s != "") or abort "entry missing #{k}" }
  abort "signer not anchored to keys/tell.fpr" unless e["signer"] == ENV["REGFPR"]
' || fail "register entry malformed or signer not anchored to the published fingerprint"
ok "entry carries id/name/url/scope/signer/reports; signer = published fpr; branch tell/<scope>/<id> signs ownership"

echo "ALL TESTS PASSED"
