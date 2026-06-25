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

echo "[7] QR token round-trips through the ejected authz check"
url="$(bin/qr cd04-q1 1 "Q?" "Yes,No" 2>/dev/null)"
tok="$(printf '%s' "$url" | sed -n 's/.*[?&]tok=\([0-9a-f]*\).*/\1/p')"
[ -n "$tok" ] || fail "bin/qr emitted no token"
bin/authz cd04-q1 1 "$tok" 2>/dev/null || fail "authz rejected a valid token"
bin/authz cd04-q1 1 "${tok%?}f" 2>/dev/null && fail "authz accepted a tampered token" || true
bin/authz cd04-q1 2 "$tok"      2>/dev/null && fail "authz accepted a wrong round"     || true
bin/authz ghost   1 "$tok"      2>/dev/null && fail "authz accepted an unknown pile"   || true
ok "valid token accepted; tamper / wrong-round / unknown-pile rejected"

echo "[8] collect-submissions stages only authorized replies"
mkb() { jq -n --arg p "$1" --arg r "$2" --arg t "$3" --arg a "$4" \
  '{schema:"tell.submission/v0",pile:$p,round:$r,tok:$t,answer:$a,ts:"2026-06-25T19:00:00Z"}'; }
fence() { printf '```tell\n%s\n```' "$1"; }
jq -n \
  --arg b1 "$(fence "$(mkb cd04-q1 1 "$tok" Yes)")" \
  --arg b2 "$(fence "$(mkb cd04-q1 1 "$tok" Study)")" \
  --arg b3 "$(fence "$(mkb cd04-q1 1 "${tok%?}f" No)")" \
  --arg b4 "$(fence "$(mkb ghost 1 "$tok" Yes)")" \
  --arg b5 "no block here" \
  '[{number:1,body:$b1},{number:2,body:$b2},{number:3,body:$b3},{number:4,body:$b4},{number:5,body:$b5}]' \
  > "$work/issues.json"
TELL_ISSUES_JSON="$work/issues.json" TELL_SUBMISSIONS_DIR="$work/stage" bin/collect-submissions 2>/dev/null
[ "$(wc -l < "$work/stage/.accepted.tsv")" = 2 ] || fail "expected 2 accepted"
[ "$(wc -l < "$work/stage/.rejected.tsv")" = 2 ] || fail "expected 2 rejected (bad token + unknown pile)"
ok "2 authorized staged, 2 rejected, no-block issue ignored"

echo "[9] rollup emits the accepted batch; deliver seals it; consumer verifies"
rb="$work/rollup.block"
TELL_SUBMISSIONS_DIR="$work/stage" bin/rollup cd04-q1 colorado > "$rb"
[ "$(jq -r '.count' "$rb")" = 2 ] || fail "rollup did not batch the 2 accepted answers"
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

echo "[10] empty stage => rollup emits nothing (deliver would skip)"
[ -z "$(TELL_SUBMISSIONS_DIR="$work/empty" bin/rollup cd04-q1 colorado)" ] || fail "rollup emitted on empty stage"
ok "no staged submissions -> no block"

if command -v node >/dev/null 2>&1; then
  echo "[11] landing builds a parseable issues/new link"
  node "$root/test/landing.test.mjs" || fail "landing link-builder test failed"
  ok "landing emits a valid prefilled issue link"
else
  echo "[11] SKIPPED — node not available for the landing test"
fi

echo "ALL TESTS PASSED"
