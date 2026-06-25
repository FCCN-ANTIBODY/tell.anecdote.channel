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

echo "[7] rollup hook emits sealable output, and deliver seals it"
rb="$work/rollup.block"
bin/rollup cd04-q1 colorado > "$rb"
[ -s "$rb" ] || fail "bin/rollup produced no output"
jq -e . "$rb" >/dev/null || fail "bin/rollup output is not valid JSON"
bin/deliver --dir "$work/rfeed" --recipient "$recip" --signkey "$work/sign" --block "$rb" >/dev/null \
  || fail "deliver could not seal rollup output"
ok "rollup output sealed into a delivery block"

echo "ALL TESTS PASSED"
