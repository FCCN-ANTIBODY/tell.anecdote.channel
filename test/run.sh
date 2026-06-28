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

echo "[8b] bin/qr adds a provenance signature over the canonical payload; it verifies, tamper fails"
. "$root/bin/tell-lib.sh"   # tl_qr_canon (same preimage the signer used)
# Accepted-signers line, principal "tell" (mirrors keys/tell.signers).
printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/qr.signers"
surl="$(bin/qr --pile cd04-q1 --poll bikes --round 1 --question "Expand bike lanes?" \
  --opts "Yes,No,Study" --signkey "$work/sign" 2>/dev/null)"
echo "$surl" | grep -q '[?&]sig='        || fail "bin/qr emitted no provenance signature"
echo "$surl" | grep -q '[?&]kid=SHA256'  || fail "bin/qr emitted no signer id (kid)"
# Token still mints alongside the signature.
echo "$surl" | grep -q '[?&]tok=[0-9a-f]\{64\}' || fail "signed QR lost its authorization token"
# Recover the armored signature (URL-decode, then base64 -d) and the payload params.
urldec() { printf '%b' "${1//%/\\x}"; }
params="$(printf '%s' "${surl#*\?}" | tr '&' '\n')"
urldec "$(printf '%s\n' "$params" | sed -n 's/^sig=//p')" | base64 -d > "$work/qr.sig"
# Rebuild the exact preimage (params minus sig/kid, canonicalized) and verify it.
printf '%s\n' "$params" | tl_qr_canon | \
  ssh-keygen -Y verify -n tell-poll -I tell -f "$work/qr.signers" -s "$work/qr.sig" >/dev/null 2>&1 \
  || fail "QR provenance signature does not verify against the canonical payload"
# Tamper a signed field => verification must fail.
printf '%s\n' "$params" | sed 's/^poll=.*/poll=TAMPER/' | tl_qr_canon | \
  ssh-keygen -Y verify -n tell-poll -I tell -f "$work/qr.signers" -s "$work/qr.sig" >/dev/null 2>&1 \
  && fail "tampered payload still verified" || true
# Wrong namespace must not verify (a delivery sig can't be replayed as a poll sig).
printf '%s\n' "$params" | tl_qr_canon | \
  ssh-keygen -Y verify -n data-pile -I tell -f "$work/qr.signers" -s "$work/qr.sig" >/dev/null 2>&1 \
  && fail "signature verified under the wrong namespace" || true
ok "signed QR keeps its token, carries a verifying namespace-separated provenance signature; tamper breaks it"

echo "[8c] authz verifies the carried QR signature as a worth-processing gate"
qrpayload="${surl#*\?}"                                  # what the landing carries as block.qr
qrtok="$(printf '%s\n' "$params" | sed -n 's/^tok=//p')"
qsub() { jq -n --arg p cd04-q1 --arg poll bikes --arg r 1 --arg t "$qrtok" --arg q "$1" \
  '{schema:"tell.submission/v1",pile:$p,poll:$poll,round:$r,type:"open",tok:$t,answer:"Yes",qr:$q}'; }
# A validly signed payload passes the gate.
TELL_SIGNERS="$work/qr.signers" qsub "$qrpayload" | bin/authz 2>/dev/null \
  || fail "authz rejected a validly signed submission"
# Tamper a signed field inside qr => signature no longer verifies => rejected.
TELL_SIGNERS="$work/qr.signers" qsub "$(printf '%s' "$qrpayload" | sed 's/poll=bikes/poll=budget/')" \
  | bin/authz 2>/dev/null && fail "authz accepted a tampered signed payload" || true
# Bind: a VALID token for a different poll (budget) attached to the bikes payload => the
# HMAC check passes but the signed payload's token != the submission token => rejected.
jq -n --arg t "$tokB" --arg q "$qrpayload" \
  '{schema:"tell.submission/v1",pile:"cd04-q1",poll:"budget",round:"1",type:"open",tok:$t,answer:"Yes",qr:$q}' \
  | TELL_SIGNERS="$work/qr.signers" bin/authz 2>/dev/null \
  && fail "authz accepted a signed payload bound to another poll's token" || true
# Strict mode rejects an unsigned submission (no qr).
TELL_REQUIRE_SIG=1 sub cd04-q1 budget 1 "$tokB" | bin/authz 2>/dev/null \
  && fail "TELL_REQUIRE_SIG accepted an unsigned submission" || true
# Default (no strict) still accepts unsigned on the token alone — provenance is additive.
sub cd04-q1 budget 1 "$tokB" | bin/authz 2>/dev/null || fail "default authz rejected a valid unsigned submission"
ok "signed payload verified + bound; tamper / token-swap / (strict) unsigned rejected; unsigned still ok by default"

echo "[9] govern judges staged answers against constitutions/<pile>/<poll>.json (pre-seal, no key)"
# Real stage (budget=Cut, bikes=Yes — both listed options) gets accepted mechanically and
# annotated in place, so the rollup below seals the verdict into the digest.
rep="$(TELL_SUBMISSIONS_DIR="$work/stage" TELL_REPORTS_DIR="$work/reports" bin/govern)"
[ "$(jq -r '.counts.accept' "$rep")" = 2 ] || fail "govern did not accept the two listed-option answers"
for f in "$work"/stage/cd04-q1/*.json; do
  [ "$(jq -r '.governed' "$f")" = accept ] || fail "govern did not annotate staged record with its verdict"
  [ "$(jq -r '.voucher.schema' "$f")" = tell.voucher/v1 ] || fail "govern did not attach a voucher"
  [ "$(jq -r '.voucher.location.confidence' "$f")" = 0 ] || fail "default voucher must measure 0 (honest, not faked)"
done
# The public report surfaces a COARSE voucher projection (gradient/confidence/source-kind)
# and never a location value.
[ "$(jq -r '.records[0].vouch.source_kind' "$rep")" = asserted ] || fail "report missing coarse voucher source-kind"
jq -e '.records[] | .vouch | has("value") | not' "$rep" >/dev/null || fail "public report leaked a location value"
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
# rollup carries the full per-record voucher (sealed) AND a coarse top-level summary (promoted
# to the clear head). The summary location object is gradient-histogram + ranges only — no value.
[ "$(jq -r '.vouch.schema' "$rb")" = tell.voucher.summary/v1 ] || fail "rollup did not emit a coarse voucher summary"
[ "$(jq -r '.vouch.source.kinds.asserted' "$rb")" = 2 ] || fail "summary should class both records asserted"
[ "$(jq -r '[.records[].voucher.schema]|unique|join(",")' "$rb")" = tell.voucher/v1 ] || fail "rollup dropped the per-record voucher"
[ "$(jq -r '.vouch.location|keys|sort|join(",")' "$rb")" = "gradients,max_confidence,min_confidence" ] || fail "coarse summary carries more than gradient+ranges"
bin/deliver --dir "$work/rfeed" --recipient "$recip" --signkey "$work/sign" --block "$rb" >/dev/null \
  || fail "deliver could not seal rollup output"
# deliver promoted the coarse summary into the CLEAR head entry (covered by head.sig); raw
# (non-digest) genesis blocks from [1] carry no vouch at all (byte-identical to pre-feature).
[ "$(jq -r '.entries[-1].vouch.schema' "$work/rfeed/inbox/manifest.json")" = tell.voucher.summary/v1 ] || fail "deliver did not promote vouch into the signed head"
[ "$(jq -r 'any(.entries[]; has("vouch"))' "$feed/inbox/manifest.json")" = false ] || fail "raw blocks must carry no vouch in the head"
if [ -x "$DP_REPO/bin/verify" ]; then
  printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/qr.signers"
  "$DP_REPO/bin/verify" --dir "$work/rfeed" --source tell --signers "$work/qr.signers" >/dev/null \
    || fail "consumer rejected the sealed submissions (signature must cover entries[].vouch)"
  ok "accepted batch sealed + verified end to end (coarse vouch signed into the head)"
else
  ok "accepted batch sealed (consumer verify skipped — no \$DP_REPO)"
fi

echo "[10b] TELL_VOUCH_CMD plugs a measured signal: value stays sealed, coarse gradient signed into the head"
vs="$work/vstage/cd04-q1"; mkdir -p "$vs"
jq -n '{number:1,pile:"cd04-q1",poll:"budget",type:"open",asker:"a",shown_guidance:"g",round:"1",answer:"Cut",ts:"t"}' > "$vs/1.json"
printf '#!/usr/bin/env bash\njq -n %s\n' \
  "'{schema:\"tell.voucher/v1\",location:{gradient:\"state\",value:\"CO\",confidence:0.6},source:{kind:\"sensor\",confidence:0.7},basis:[\"ip-coarse\"]}'" \
  > "$work/vcmd"; chmod +x "$work/vcmd"
vrep="$(TELL_VOUCH_CMD="$work/vcmd" TELL_SUBMISSIONS_DIR="$work/vstage" TELL_REPORTS_DIR="$work/reports" bin/govern)"
[ "$(jq -r '.voucher.location.gradient' "$vs/1.json")" = state ] || fail "TELL_VOUCH_CMD voucher not attached"
[ "$(jq -r '.voucher.location.value' "$vs/1.json")" = CO ] || fail "full voucher must keep the value (it stays sealed)"
[ "$(jq -r '.records[0].vouch.loc_gradient' "$vrep")" = state ] || fail "report should carry the coarse gradient"
jq -e '.records[] | .vouch | has("value") | not' "$vrep" >/dev/null || fail "report leaked a location value"
vb="$work/vrollup.block"
TELL_SUBMISSIONS_DIR="$work/vstage" bin/rollup cd04-q1 colorado > "$vb"
[ "$(jq -r '.vouch.location.gradients.state' "$vb")" = 1 ] || fail "summary did not histogram the state gradient"
[ "$(jq -r '.records[0].voucher.location.value' "$vb")" = CO ] || fail "sealed record should keep the value"
jq -e '.vouch.location | has("value") | not' "$vb" >/dev/null || fail "coarse summary leaked a value"
bin/deliver --dir "$work/vfeed" --recipient "$recip" --signkey "$work/sign" --block "$vb" >/dev/null \
  || fail "deliver failed on a vouched block"
[ "$(jq -r '.entries[-1].vouch.location.gradients.state' "$work/vfeed/inbox/manifest.json")" = 1 ] || fail "deliver did not promote the coarse gradient into the signed head"
jq -e '.entries[-1].vouch.location | has("value") | not' "$work/vfeed/inbox/manifest.json" >/dev/null || fail "signed head leaked a location value"
if [ -x "$DP_REPO/bin/verify" ]; then
  printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/v.signers"
  "$DP_REPO/bin/verify" --dir "$work/vfeed" --source tell --signers "$work/v.signers" >/dev/null \
    || fail "consumer rejected a vouched chain (signature must cover entries[].vouch)"
  ok "measured voucher: value kept private, coarse gradient signed into the head, consumer verifies"
else
  ok "measured voucher sealed + promoted (consumer verify skipped — no \$DP_REPO)"
fi

echo "[10c] head.sig covers entries[].vouch (vendored-core stand-in for the consumer)"
# Even without a data-pile checkout, prove the promoted vouch is INSIDE what the head signs:
# recompute the signed digest with our vendored dp_entries_digest (byte-identical to the
# consumer's, guarded by [3b]) and check the ssh signature over it — then confirm a tampered
# vouch breaks that signature, i.e. an edge/Atlas reading entries[].vouch reads signed data.
vman="$work/vfeed/inbox/manifest.json"
jq -e '.entries[-1] | has("vouch")' "$vman" >/dev/null || fail "vouch missing from the signed head"
vdig="$(dp_entries_digest "$vman")"
[ "$vdig" = "$(jq -r '.head.digest' "$vman")" ] || fail "recomputed entries digest != head.digest"
jq -r '.head.sig' "$vman" | base64 -d > "$work/v.sig"
printf 'tell %s\n' "$(cat "$work/sign.pub")" > "$work/v.allowed"
printf '%s' "$vdig" | ssh-keygen -Y verify -f "$work/v.allowed" -I tell -n data-pile -s "$work/v.sig" >/dev/null 2>&1 \
  || fail "head.sig did not verify over the digest that includes entries[].vouch"
jq '.entries[-1].vouch.location.min_confidence = 0.99' "$vman" > "$work/v.tamper.json"
tdig="$(dp_entries_digest "$work/v.tamper.json")"
printf '%s' "$tdig" | ssh-keygen -Y verify -f "$work/v.allowed" -I tell -n data-pile -s "$work/v.sig" >/dev/null 2>&1 \
  && fail "a tampered vouch still verified — the field is not actually signed" || true
ok "promoted vouch is inside the signed digest; signature verifies and rejects a tampered vouch"

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
# Action-ready: identity resolves to a workspace path (TELL_YML), and register fails closed
# without one rather than registering the wrong Tell (the .github/actions/register contract).
cp tell.yml "$work/other.yml"; sed -i 's/^scope:.*/scope: larimer/' "$work/other.yml"
ob="$(TELL_YML="$work/other.yml" TELL_FPR_FILE="$work/tell.fpr" bin/register branch)"
[ "$ob" = "tell/larimer/$tid" ] || fail "TELL_YML override not honored (got '$ob')"
( cd "$work" && TELL_FPR_FILE="$work/tell.fpr" "$root/bin/register" entry >/dev/null 2>&1 ) \
  && fail "register did not fail closed without a workspace tell.yml" || true
ok "TELL_YML override honored; register fails closed without a workspace identity"

echo "[14] bin/widget renders the data-filled fragment with this node's geo-stamped locator"
frag="$(bin/widget --atlas antibody --scope colorado --tell tell)"
# Same fragment contract as the baked baseline: an anecdote-widget section carrying the
# tell name and the dormant postMessage handle.
printf '%s' "$frag" | grep -q 'data-widget="tell"'      || fail "widget: not an anecdote-widget tell fragment"
printf '%s' "$frag" | grep -q 'data-node="tell.antibody.colorado.anecdote.channel"' \
  || fail "widget: resolved node host wrong"
printf '%s' "$frag" | grep -q 'NAME = "tell"'           || fail "widget: dormant postMessage handle missing"
# The geo-LESS stem goes to the hub; the home state rides alongside as a param. The home
# state must NOT be baked into the QR's host stem — that is what the hub fills at scan time.
printf '%s' "$frag" | grep -q 'tell.anecdote.channel/?node=tell.antibody&amp;home=colorado' \
  || fail "widget: locator does not hand the geo-less stem (+home) to the hub"
printf '%s' "$frag" | grep -q 'node=tell.antibody.colorado' \
  && fail "widget: locator baked the home state into the stem (hub must fill geo)" || true
# qrencode bakes inline SVG when present; otherwise the fragment degrades to a text link.
# Either is a pass — assert the build never emits an empty/broken QR slot.
if command -v qrencode >/dev/null 2>&1; then
  printf '%s' "$frag" | grep -q '<svg'                  || fail "widget: qrencode present but no inline SVG baked"
else
  printf '%s' "$frag" | grep -q 'QR omitted'            || fail "widget: no SVG and no text fallback"
fi
# A moniker can only ever be a DNS label — it must not be able to smuggle path/query.
bin/widget --atlas 'a/b' --scope colorado >/dev/null 2>&1 && fail "widget: accepted a non-DNS-label moniker" || true
ok "data-filled fragment: tell contract preserved, geo-less locator handed to the hub, label-guarded"

echo "ALL TESTS PASSED"
