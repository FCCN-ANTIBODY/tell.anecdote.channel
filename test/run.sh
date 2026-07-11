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

echo "[8b2] the terms pointer mints INSIDE the signed canon (antidote docs/faces.md handoff)"
CHASH="sha256:$(printf 'terms' | sha256sum | cut -d' ' -f1)"
curl2="$(bin/qr --pile cd04-q1 --poll bikes --round 1 --constitution "$CHASH" --signkey "$work/sign" 2>/dev/null)"
echo "$curl2" | grep -q "[?&]constitution=${CHASH}" || fail "minted QR does not carry the constitution"
cparams="$(printf '%s' "${curl2#*\?}" | tr '&' '\n')"
urldec "$(printf '%s\n' "$cparams" | sed -n 's/^sig=//p')" | base64 -d > "$work/qr2.sig"
printf '%s\n' "$cparams" | tl_qr_canon | \
  ssh-keygen -Y verify -n tell-poll -I tell -f "$work/qr.signers" -s "$work/qr2.sig" >/dev/null 2>&1 \
  || fail "constitution-bearing QR signature does not verify"
# Swap the terms pointer => the signature must break: the law is inside the canon, never strippable.
printf '%s\n' "$cparams" | sed "s/^constitution=.*/constitution=sha256:$(printf 'x%.0s' 1 | sha256sum | cut -d' ' -f1)/" | tl_qr_canon | \
  ssh-keygen -Y verify -n tell-poll -I tell -f "$work/qr.signers" -s "$work/qr2.sig" >/dev/null 2>&1 \
  && fail "a swapped constitution still verified" || true
bin/qr --pile cd04-q1 --poll bikes --round 1 --constitution "sha256:short" >/dev/null 2>&1 \
  && fail "a malformed terms pointer was minted" || true
ok "the constitution rides the QR inside the provenance signature; swapping it breaks the sig; malformed refused"

echo "[8c] authz verifies the carried QR signature as a worth-processing gate"
qrpayload="${surl#*\?}"                                  # what the landing carries as block.qr
qrtok="$(printf '%s\n' "$params" | sed -n 's/^tok=//p')"
qsub() { jq -n --arg p cd04-q1 --arg poll bikes --arg r 1 --arg t "$qrtok" --arg q "$1" \
  '{schema:"tell.submission/v1",pile:$p,poll:$poll,round:$r,type:"open",tok:$t,answer:"Yes",qr:$q}'; }
# A validly signed payload passes the gate. (env on the bin/authz side of the pipe!)
qsub "$qrpayload" | TELL_SIGNERS="$work/qr.signers" bin/authz 2>/dev/null \
  || fail "authz rejected a validly signed submission"
# Tamper a signed field inside qr => signature no longer verifies => rejected.
qsub "$(printf '%s' "$qrpayload" | sed 's/poll=bikes/poll=budget/')" \
  | TELL_SIGNERS="$work/qr.signers" bin/authz 2>/dev/null && fail "authz accepted a tampered signed payload" || true
# Bind: a VALID token for a different poll (budget) attached to the bikes payload => the
# HMAC check passes but the signed payload's token != the submission token => rejected.
jq -n --arg t "$tokB" --arg q "$qrpayload" \
  '{schema:"tell.submission/v1",pile:"cd04-q1",poll:"budget",round:"1",type:"open",tok:$t,answer:"Yes",qr:$q}' \
  | TELL_SIGNERS="$work/qr.signers" bin/authz 2>/dev/null \
  && fail "authz accepted a signed payload bound to another poll's token" || true
# Strict mode rejects an unsigned submission (no qr).
sub cd04-q1 budget 1 "$tokB" | TELL_REQUIRE_SIG=1 bin/authz 2>/dev/null \
  && fail "TELL_REQUIRE_SIG accepted an unsigned submission" || true
# Default (no strict) still accepts unsigned on the token alone — provenance is additive.
sub cd04-q1 budget 1 "$tokB" | bin/authz 2>/dev/null || fail "default authz rejected a valid unsigned submission"
ok "signed payload verified + bound; tamper / token-swap / (strict) unsigned rejected; unsigned still ok by default"

echo "[8d] canonical-issue COMMENT thread: qr mode/run/canonical, open-poll, collect sweeps comments"
# The comment paradigm is THE paradigm: bin/qr defaults to mode=comment, refuses the retired
# mode=issue outright, and carries a run id (tells QRs apart) + the canonical issue comments
# attach to, plus an OPTIONAL semi-public post credential (carried, never minted).
qc="$(bin/qr --pile cd04-q1 --poll budget --round 1 --canonical 7 --run runX 2>/dev/null)"
echo "$qc" | grep -q 'mode=comment' && echo "$qc" | grep -q 'canonical=7' && echo "$qc" | grep -q 'run=runX' \
  || fail "qr did not emit mode/canonical/run (comment must be the default)"
echo "$qc" | grep -q 'post=' && fail "qr leaked a post credential with no TELL_POST_TOKEN" || true
echo "$qc" | grep -q '[?&]tok=[0-9a-f]\{64\}' || fail "comment-mode qr lost its authorization token"
TELL_POST_TOKEN=ghs_demo bin/qr --pile cd04-q1 --poll budget --round 1 --mode comment --canonical 7 2>/dev/null \
  | grep -q 'post=ghs_demo' || fail "qr did not carry TELL_POST_TOKEN as the post credential"
# mode=issue is RETIRED: minting it is refused; the issueUrl fallback is the one new-issue path left.
bin/qr --pile cd04-q1 --poll budget --mode issue 2>/dev/null && fail "retired mode=issue still mints" || true
# A canonical-less QR still mints (it carries only the issueUrl fallback) — but a CREDENTIALED
# canonical-less QR would mint a dead route, so it is refused.
bin/qr --pile cd04-q1 --poll budget 2>/dev/null | grep -q 'mode=comment' \
  || fail "canonical-less (fallback-only) qr did not mint in comment mode"
TELL_POST_TOKEN=ghs_demo bin/qr --pile cd04-q1 --poll budget 2>/dev/null \
  && fail "credentialed (post=) qr minted without --canonical" || true

echo "[8e] submit-gateway address (submit=) supersedes the embedded credential"
# --submit-url (or TELL_SUBMIT_URL) rides as submit= — and the credential is NOT embedded beside it.
# A relayed reply only ever COMMENTS on the canonical issue, so a submit= mint needs --canonical too.
qsu="$(TELL_POST_TOKEN=ghs_demo bin/qr --pile cd04-q1 --poll budget --round 1 --canonical 7 \
  --submit-url https://tell.anecdote.channel/submit 2>/dev/null)"
echo "$qsu" | grep -q 'submit=https%3A%2F%2Ftell.anecdote.channel%2Fsubmit' || fail "qr did not carry the submit URL as submit="
echo "$qsu" | grep -q 'post=' && fail "qr embedded the credential despite a submit URL" || true
echo "$qsu" | grep -q '[?&]tok=[0-9a-f]\{64\}' || fail "submit-mode qr lost its authorization token"
TELL_SUBMIT_URL=https://tell.example/submit bin/qr --pile cd04-q1 --poll budget --canonical 7 2>/dev/null \
  | grep -q 'submit=https%3A%2F%2Ftell.example%2Fsubmit' || fail "TELL_SUBMIT_URL env not honored"
bin/qr --pile cd04-q1 --poll budget --canonical 7 --submit-url 'http://insecure' 2>/dev/null && fail "non-https submit URL accepted" || true
bin/qr --pile cd04-q1 --poll budget --canonical 7 --submit-url 'https://x/?a=b' 2>/dev/null && fail "query-carrying submit URL accepted" || true
bin/qr --pile cd04-q1 --poll budget --submit-url https://tell.example/submit 2>/dev/null \
  && fail "credentialed (submit=) qr minted without --canonical (a dead route)" || true
# submit= is dropped from the signed canon (like post): a signed QR minted WITH a submit URL
# verifies over the same preimage after submit= is stripped — moving the worker re-mints nothing.
ssu="$(bin/qr --pile cd04-q1 --poll bikes --round 1 --question "Q" --canonical 7 \
  --submit-url https://tell.anecdote.channel/submit --signkey "$work/sign" 2>/dev/null)"
sparams="$(printf '%s' "${ssu#*\?}" | tr '&' '\n')"
urldec "$(printf '%s\n' "$sparams" | sed -n 's/^sig=//p')" | base64 -d > "$work/qr-su.sig"
printf '%s\n' "$sparams" | tl_qr_canon | grep -q '^submit=' && fail "tl_qr_canon did not drop submit=" || true
printf '%s\n' "$sparams" | tl_qr_canon | \
  ssh-keygen -Y verify -n tell-poll -I tell -f "$work/qr.signers" -s "$work/qr-su.sig" >/dev/null 2>&1 \
  || fail "signed submit-mode QR does not verify over the submit-stripped canon"
ok "submit= rides unbound, suppresses post=, drops from canon; https-only, no query"
[ "$(TELL_OPENPOLL_DRYRUN=1 bin/open-poll --pile cd04-q1 --poll budget --question Q 2>/dev/null)" = 0 ] \
  || fail "open-poll dryrun did not print a placeholder canonical number"

# A comment on the canonical issue (#7) carries the same fenced block PLUS nonce/run/anecdote; the
# anchor (tell.canonical/v1) is ignored, not staged.
anec='{"schema":"anecdote/v1","to":{"id":"cd04-q1","kind":"tell"},"label":"shade","body":[{"kind":"text","text":"Cut"}],"sig":{"alg":"ed25519","by":"key:sha256:aa"}}'
cblk="$(jq -n --arg t "$tokB" --argjson a "$anec" '{schema:"tell.submission/v1",pile:"cd04-q1",poll:"budget",round:"1",type:"anecdote",asker:"clerk",shown_guidance:"g",tok:$t,answer:"Cut",nonce:"nonce:abc",run:"runX",anecdote:$a}')"
anchor="$(jq -n '{schema:"tell.canonical/v1",pile:"cd04-q1",poll:"budget",round:"1"}')"
jq -n --arg c "$(fence "$cblk")" --arg an "$(fence "$anchor")" \
  '[{issue:7,id:1001,body:$c},{issue:7,id:1002,body:$an}]' > "$work/comments.json"
TELL_COMMENTS_JSON="$work/comments.json" TELL_SUBMISSIONS_DIR="$work/cstage" bin/collect-submissions 2>/dev/null
[ "$(wc -l < "$work/cstage/.accepted.tsv")" = 1 ] || fail "expected 1 accepted comment (anchor ignored)"
cf="$work/cstage/cd04-q1/c1001.json"
[ "$(jq -r '.source' "$cf")" = comment ] || fail "comment not tagged source=comment"
[ "$(jq -r '.comment' "$cf")" = 1001 ] || fail "comment id not staged"
[ "$(jq -r '.number' "$cf")" = 7 ] || fail "parent canonical issue not staged"
[ "$(jq -r '.nonce' "$cf")" = "nonce:abc" ] || fail "nonce not staged"
[ "$(jq -r '.run' "$cf")" = runX ] || fail "run not staged"
[ "$(jq -r '.anecdote.sig.alg' "$cf")" = ed25519 ] || fail "signed anecdote not staged"
printf '%s' "$(head -1 "$work/cstage/.accepted.tsv")" | grep -q $'^comment\t1001\tcd04-q1$' || fail ".accepted.tsv not source/ref/pile"
# govern preserves the new fields; rollup seals them so the pile can honor revocation by nonce.
TELL_SUBMISSIONS_DIR="$work/cstage" TELL_REPORTS_DIR="$work/reports" bin/govern >/dev/null
crb="$work/crb.json"; TELL_SUBMISSIONS_DIR="$work/cstage" bin/rollup cd04-q1 colorado > "$crb"
[ "$(jq -r '.records[0].nonce' "$crb")" = "nonce:abc" ] || fail "rollup dropped the nonce"
[ "$(jq -r '.records[0].run' "$crb")" = runX ] || fail "rollup dropped the run"
[ "$(jq -r '.records[0].anecdote.sig.alg' "$crb")" = ed25519 ] || fail "rollup dropped the signed anecdote"
# finalize signals a comment by a reaction (it can't be labeled); an issue still labels+closes.
TELL_SUBMISSIONS_DIR="$work/cstage" TELL_FINALIZE_DRYRUN=1 bin/finalize-submissions 2>/dev/null \
  | grep -q 'issues/comments/1001/reactions -f content=+1' || fail "finalize did not react on the accepted comment"
ok "comment thread staged with nonce/run/anecdote; anchor ignored; sealed by rollup; finalize reacts"

if command -v node >/dev/null 2>&1; then
  # the on-device port (bin/rollup.mjs) must fold this rich stage (nonce/run/anecdote/governed/voucher)
  # into the identical digest — everything but window_end, which is a timestamp.
  crbm="$work/crb-mjs.json"; TELL_SUBMISSIONS_DIR="$work/cstage" node bin/rollup.mjs cd04-q1 colorado > "$crbm"
  diff <(jq -S 'del(.window_end)' "$crb") <(jq -S 'del(.window_end)' "$crbm") >/dev/null \
    || fail "rollup.mjs digest differs from bin/rollup"
  ok "rollup.mjs port matches bin/rollup (records + vouch summary, minus window_end)"
fi

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

echo "[9b] bin/poll authors a Layer-1 constitution that governs; the solicitation invariant holds"
pc="$work/pcons/cd04-q1"; mkdir -p "$pc"
# Author a multichoice poll — the prefab answers ARE the solicitation signal (docs/solicitation.md).
bin/poll --pile cd04-q1 --poll parks --question "Fund the parks?" --opts "Yes, No" --out "$pc/parks.json" >/dev/null 2>&1
[ "$(jq -r '.type' "$pc/parks.json")" = multichoice ] || fail "bin/poll did not author a multichoice poll"
[ "$(jq -r '.options|length' "$pc/parks.json")" = 2 ] || fail "bin/poll dropped the prefab answers"
[ "$(jq -r '.accept_writein' "$pc/parks.json")" = false ] || fail "bin/poll defaulted write-ins ON for a multichoice poll"
# It governs: a listed-option answer is accepted mechanically against the authored file.
ps="$work/pstage/cd04-q1"; mkdir -p "$ps"
jq -n '{number:1,pile:"cd04-q1",poll:"parks",type:"multichoice",asker:"a",shown_guidance:"g",round:"1",answer:"Yes",ts:"t"}' > "$ps/1.json"
prep="$(TELL_SUBMISSIONS_DIR="$work/pstage" TELL_CONSTITUTIONS_DIR="$work/pcons" TELL_REPORTS_DIR="$work/reports" bin/govern)"
[ "$(jq -r '.records[]|select(.issue==1)|.verdict' "$prep")" = accept ] || fail "an authored constitution did not govern a listed-option answer"
# THE INVARIANT: a poll solicits; a multichoice with no prefab answer is refused (that would be an anecdote).
bin/poll --pile cd04-q1 --poll void --question "thoughts?" --type multichoice --out - >/dev/null 2>&1 \
  && fail "bin/poll authored a multichoice poll with no prefab answer" || true
# An open poll carries no prefab options.
bin/poll --pile cd04-q1 --poll bad --question q --type open --opts "A,B" --out - >/dev/null 2>&1 \
  && fail "bin/poll authored an open poll with prefab options" || true
ok "bin/poll writes Layer-1 that governs; prefab-answer invariant enforced (poll vs anecdote boundary)"

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
command -v node >/dev/null 2>&1 && { [ -z "$(TELL_SUBMISSIONS_DIR="$work/empty" node bin/rollup.mjs cd04-q1 colorado)" ] || fail "rollup.mjs emitted on empty stage"; }
ok "no staged submissions -> no block"

if command -v node >/dev/null 2>&1; then
  echo "[12] landing builds a parseable issues/new link"
  node "$root/test/landing.test.mjs" || fail "landing link-builder test failed"
  ok "landing emits a valid prefilled issue link"
else
  echo "[12] SKIPPED — node not available for the landing test"
fi

if command -v node >/dev/null 2>&1; then
  echo "[12b] boundary declarations compile, pin, verify, and renew (cross-checked with the real client when present)"
  node "$root/test/boundaries.test.mjs" || fail "boundary declaration test failed"
  ok "boundaries: compile/check/renew + client cross-check"
else
  echo "[12b] SKIPPED — node not available for the boundaries test"
fi

if command -v node >/dev/null 2>&1; then
  echo "[12c] submit-gateway worker is a pure, allowlisted, credential-shielding relay"
  node "$root/test/submit-gateway.test.mjs" || fail "submit-gateway worker test failed"
  ok "submit-gateway: relays verbatim, allowlists one repo's comment threads, never leaks the credential"
else
  echo "[12c] SKIPPED — node not available for the submit-gateway test"
fi

if command -v node >/dev/null 2>&1; then
  echo "[12d] the Floor: the name is a key, the vault is local, the iframe is fixed on Tell"
  node "$root/test/floor.test.mjs" || fail "floor test failed"
  ok "floor: local-first vault; no fetch surface; no tok ever rides client-side"
else
  echo "[12d] SKIPPED — node not available for the floor test"
fi

if command -v node >/dev/null 2>&1; then
  echo "[12f] sealed credential: the submit worker holds one secret and zero tokens"
  node "$root/test/sealed-credential.test.mjs" || fail "sealed-credential test failed"
  ok "seal: binding vetted before the token acts; foreign ciphers are noise"
else
  echo "[12f] SKIPPED — node not available for the sealed-credential test"
fi

echo "[12e] bin/floor-build emits the Floor as its own complete Pages site"
fbout="$work/floor-site"
FLOOR_CNAME="floor.tell.anecdote.channel" bin/floor-build "$fbout" 2>/dev/null
for f in index.html floor.mjs sw.js CNAME .nojekyll; do
  [ -f "$fbout/$f" ] || fail "floor-build missing $f"
done
[ "$(cat "$fbout/CNAME")" = "floor.tell.anecdote.channel" ] || fail "floor-build CNAME wrong"
cmp -s "$fbout/index.html" floor/index.html || fail "floor-build must ship the template byte-identical"
ok "floor-build: template + CNAME + .nojekyll, bytes identical to floor/"

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

echo "[16] bin/tenants: per-tenant accounting (size via git-objects, blocks via manifest, pooled dedup)"
if command -v node >/dev/null 2>&1; then
  acct="$work/acct"; git init -q -b main "$acct"
  mkdir -p "$acct/_data"; printf -- '- id: cd04-q1\n  scope: "colorado"\n- id: cd04-q2\n  scope: "colorado"\n' > "$acct/_data/piles.yml"
  git -C "$acct" add _data; git -C "$acct" -c user.name=t -c user.email=t@t commit -q -m reg
  # tenant 1: an orphan feed branch with two encrypted blocks
  git -C "$acct" checkout -q --orphan feed/colorado/cd04-q1; git -C "$acct" rm -rq --cached . >/dev/null 2>&1; rm -rf "$acct/_data"
  mkdir -p "$acct/inbox"; printf '{"entries":[{"seq":0,"block":"0.enc"},{"seq":1,"block":"1.enc"}]}' > "$acct/inbox/manifest.json"
  head -c 5000 /dev/urandom > "$acct/inbox/0.enc"; head -c 5000 /dev/urandom > "$acct/inbox/1.enc"
  git -C "$acct" add inbox; git -C "$acct" -c user.name=t -c user.email=t@t commit -q -m blocks
  # tenant 2: branched FROM tenant 1 (shares those blobs — the pooled dedup case), one extra block
  git -C "$acct" checkout -q -b feed/colorado/cd04-q2
  printf '{"entries":[{"seq":0,"block":"0.enc"},{"seq":1,"block":"1.enc"},{"seq":2,"block":"2.enc"}]}' > "$acct/inbox/manifest.json"
  head -c 5000 /dev/urandom > "$acct/inbox/2.enc"; git -C "$acct" add inbox; git -C "$acct" -c user.name=t -c user.email=t@t commit -q -m +1
  git -C "$acct" checkout -qf main
  rep="$(node bin/tenants.mjs --dir "$acct" --budget-bytes 12000)"
  oracle="$(git -C "$acct" rev-list --disk-usage --objects refs/heads/feed/colorado/cd04-q1)"
  [ "$(printf '%s' "$rep" | jq -r '.tenants[] | select(.id=="cd04-q1") | .size_bytes')" = "$oracle" ] || fail "tenants size_bytes != git rev-list --disk-usage --objects"
  [ "$(printf '%s' "$rep" | jq -r '.tenants[] | select(.id=="cd04-q1") | .blocks')" = 2 ] || fail "tenants miscounted blocks from the manifest"
  [ "$(printf '%s' "$rep" | jq -r '.tenants[] | select(.id=="cd04-q2") | .over')" = true ] || fail "tenants did not flag the over-bucket tenant"
  pooled="$(printf '%s' "$rep" | jq -r '.totals.size_pooled_bytes')"
  union="$(git -C "$acct" rev-list --disk-usage --objects refs/heads/feed/colorado/cd04-q1 refs/heads/feed/colorado/cd04-q2)"
  [ "$pooled" = "$union" ] || fail "pooled total is not the object union (dedup accounting wrong)"
  [ "$(printf '%s' "$rep" | jq -r '.totals.dedup_saved_bytes')" -gt 0 ] || fail "shared history was not detected as dedup savings"
  ok "per-tenant size matches git, blocks from manifest, over-bucket flagged, pooled union = dedup-aware total"
fi

echo "[17] bin/placement: pooled bin-pack vs silo over the accounting (fixed-bucket scheduling)"
if command -v node >/dev/null 2>&1; then
  cat > "$work/tt.json" <<'JSON'
{ "schema": "tell.tenants/v1", "bucket": {"size_bytes":10000,"blocks":1000},
  "tenants": [
    { "id":"small-a","scope":"co","present":true,"size_bytes":3000,"blocks":10,"over":false },
    { "id":"small-b","scope":"co","present":true,"size_bytes":3500,"blocks":12,"over":false },
    { "id":"whale","scope":"co","present":true,"size_bytes":9000,"blocks":40,"over":false },
    { "id":"spilled","scope":"co","present":true,"size_bytes":2000,"blocks":5,"over":true },
    { "id":"absent","scope":"co","present":false,"size_bytes":0,"blocks":0,"over":false }
  ], "totals": {} }
JSON
  plan="$(node bin/placement.mjs --pool-bytes 8000 --silo-frac 0.5 < "$work/tt.json")"
  [ "$(printf '%s' "$plan" | jq -r '.pools | length')" = 1 ] || fail "placement did not pool the small tenants into one pool"
  [ "$(printf '%s' "$plan" | jq -r '.pools[0].tenants | sort | join(",")')" = "small-a,small-b" ] || fail "small tenants did not pool together"
  [ "$(printf '%s' "$plan" | jq -r '[.silos[].id] | sort | join(",")')" = "spilled,whale" ] || fail "silo policy wrong (expected whale + the over-bucket one)"
  [ "$(printf '%s' "$plan" | jq -r '.placements[] | select(.id=="spilled") | .placement')" = siloed ] || fail "the over-bucket tenant was not siloed"
  [ "$(printf '%s' "$plan" | jq -r '.pools[].size_bytes' | sort -n | tail -1)" -le 8000 ] || fail "a pool exceeded its byte cap"
  echo '{"schema":"tell.tenants/v1","tenants":[],"totals":{}}' | node bin/placement.mjs >/dev/null || fail "placement failed on an empty tenant set"
  ok "placement: packs small tenants under the cap, silos the too-big + the over-bucket, plan is the ledger shape"
fi

echo "[18] bin/graduate: King's Leap lift (pooled tenant -> its own sovereign repo)"
if command -v node >/dev/null 2>&1; then
  gp="$work/gpool"; git init -q -b main "$gp"
  mkdir -p "$gp/_data"; printf -- '- id: cd04-q9\n  scope: "colorado"\n' > "$gp/_data/piles.yml"
  git -C "$gp" add -A; git -C "$gp" -c user.name=t -c user.email=t@t commit -q -m reg
  git -C "$gp" checkout -q --orphan feed/colorado/cd04-q9; git -C "$gp" rm -rq --cached . >/dev/null 2>&1; rm -rf "$gp/_data"
  mkdir -p "$gp/inbox"; printf '{"entries":[{"seq":0,"block":"0.enc"}]}' > "$gp/inbox/manifest.json"; head -c 4000 /dev/urandom > "$gp/inbox/0.enc"
  git -C "$gp" add -A; git -C "$gp" -c user.name=t -c user.email=t@t commit -q -m b0
  git -C "$gp" checkout -qf main
  node bin/graduate.mjs --dir "$gp" --out "$work/gsilo" --id cd04-q9 --scope colorado >/dev/null || fail "graduate lift failed"
  gnew="$work/gsilo/cd04-q9"
  [ "$(git -C "$gp" rev-parse refs/heads/feed/colorado/cd04-q9^{tree})" = "$(git -C "$gnew" rev-parse main^{tree})" ] || fail "graduated tree != source tree (content changed)"
  [ "$(git -C "$gnew" rev-list --count main)" = 1 ] || fail "graduated repo is not a fresh root commit"
  [ "$(comm -12 <(git -C "$gp" rev-list --all | sort) <(git -C "$gnew" rev-list --all | sort) | wc -l | tr -d ' ')" = 0 ] || fail "graduated repo shares history with the pool (not sovereign)"
  git -C "$gnew" fsck --strict >/dev/null 2>&1 || fail "graduated repo fails git fsck"
  echo '{"schema":"tell.placement/v1","placements":[{"id":"cd04-q9","scope":"colorado","placement":"siloed"}]}' | node bin/graduate.mjs --dir "$gp" --out "$work/gplan" --from-plan >/dev/null || fail "graduate --from-plan failed"
  [ -f "$work/gplan/cd04-q9/inbox/manifest.json" ] || fail "graduate --from-plan did not lift the siloed tenant"
  ok "King's Leap: content preserved (tree ==), fresh lineage, zero shared history, composes from a placement plan"
fi

echo "ALL TESTS PASSED"

echo "[15] custody: the declared boundary holds; bootstraps never echo a secret"
bin/check-custody >/dev/null 2>&1 || fail "check-custody failed on the repo as-is"
mkdir -p "$work/badwf"; printf 'env:\n  X: ${{ secrets.SNEAKY }}\n' > "$work/badwf/x.yml"
WORKFLOWS_DIR="$work/badwf" bin/check-custody >/dev/null 2>&1 && fail "checker passed an undeclared secret-read" || true
printf 'x() { ssh-keygen -Y sign -n rogue-ns -f k; }\n' > "$work/roguebin"; mkdir -p "$work/rb"; mv "$work/roguebin" "$work/rb/rogue"
BINS_DIR="$work/rb" bin/check-custody >/dev/null 2>&1 && fail "checker passed an undeclared namespace" || true
ok "undeclared secret-read and undeclared namespace both fail the build"

# The capture-install-validate promise, tested behaviorally: stub `gh`, capture exactly the bytes
# each bootstrap hands to `gh secret set`, and assert those bytes NEVER appear on the console.
stub="$work/stub"; cap="$work/ghcap"; mkdir -p "$stub" "$cap"
cat > "$stub/gh" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = secret ] && [ "$2" = set ]; then cat > "$GH_CAPTURE_DIR/$3"; exit 0; fi
if [ "$1" = api ] && [ "$2" = user ]; then echo "op"; exit 0; fi
if [ "$1" = api ]; then echo "${GH_FAKE_REPO:-o/r}"; exit 0; fi
exit 0
STUB
chmod +x "$stub/gh"

boot="$work/tellboot"; mkdir -p "$boot/bin" "$boot/keys"
cp bin/tell-bootstrap bin/publish-signer bin/submit-bootstrap "$boot/bin/"
bout="$( cd "$boot" && GH_CAPTURE_DIR="$cap" PATH="$stub:$PATH" bin/tell-bootstrap --no-commit 2>&1 )" \
  || fail "tell-bootstrap failed under the gh stub"
for s in TELL_SIGNER_KEY TELL_SEED_IDENTITY TELL_QR_SECRET; do
  [ -s "$cap/$s" ] || fail "tell-bootstrap did not set $s"
  val="$(grep -vE '^(-----|#)' "$cap/$s" | head -1)"
  [ -n "$val" ] || fail "captured $s is empty"
  printf '%s' "$bout" | grep -qF "$val" && fail "tell-bootstrap echoed $s to the console" || true
done
grep -q . "$boot/keys/tell.fpr" || fail "tell-bootstrap did not publish the public signer material"

sout="$( cd "$boot" && GH_CAPTURE_DIR="$cap" GH_FAKE_REPO="o/r" PATH="$stub:$PATH" \
         TELL_POST_TOKEN="ghp_stub_semi_public_value" bin/submit-bootstrap --repo o/r 2>&1 )" \
  || fail "submit-bootstrap failed under the gh stub"
[ "$(cat "$cap/TELL_POST_TOKEN")" = "ghp_stub_semi_public_value" ] || fail "submit-bootstrap did not install the token"
printf '%s' "$sout" | grep -qF "ghp_stub_semi_public_value" && fail "submit-bootstrap echoed the token to the console" || true
ok "bootstraps install exactly what gh received and echo none of it (capture-install-validate, proven)"
