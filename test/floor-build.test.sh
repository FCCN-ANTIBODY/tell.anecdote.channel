#!/usr/bin/env bash
# Test bin/floor-build's PIN stamp: no pin → inert (null); a valid fingerprint → stamped; a malformed one →
# the build FAILS rather than shipping a broken pin; and the keys/anecdote.fpr file path is read. The pin is a
# public verification key, so this is about correctness, not secrecy. Run: test/floor-build.test.sh
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }
VALID="key:sha256:$(printf 'a%.0s' $(seq 1 64))"

# 1. no pin set → the built pin stays null (adapter inert). Only meaningful when the operator has not already
#    committed keys/anecdote.fpr (which would legitimately stamp a real pin).
if [ -f "$here/keys/anecdote.fpr" ]; then
  ok "keys/anecdote.fpr present (operator-set) — skipping the null-default case"
else
  FLOOR_PLATFORM_KEY="" bin/floor-build "$work/none" >/dev/null 2>&1 || fail "build with no pin should succeed"
  grep -q "PLATFORM_KEY = null;" "$work/none/pin.mjs" || fail "no pin → pin.mjs should stay null"
  ok "no pin → built pin.mjs stays null (adapter inert)"
fi

# 2. a valid fingerprint via FLOOR_PLATFORM_KEY → stamped into the built pin.mjs; the null default is gone.
FLOOR_PLATFORM_KEY="$VALID" bin/floor-build "$work/set" >/dev/null 2>&1 || fail "build with a valid pin should succeed"
grep -q "PLATFORM_KEY = \"$VALID\";" "$work/set/pin.mjs" || fail "valid pin not stamped"
! grep -q "PLATFORM_KEY = null" "$work/set/pin.mjs" || fail "null default left behind after stamping"
ok "a valid fingerprint is stamped into the built pin.mjs"

# 3. a malformed fingerprint → the build FAILS (no broken/inert pin shipped silently).
if FLOOR_PLATFORM_KEY="key:sha256:nothex" bin/floor-build "$work/bad" >/dev/null 2>&1; then
  fail "build should reject a malformed fingerprint"
fi
[ ! -e "$work/bad/pin.mjs" ] || ! grep -q "nothex" "$work/bad/pin.mjs" || fail "a malformed pin must never reach pin.mjs"
ok "a malformed fingerprint fails the build (no broken pin shipped)"

# 4. the file path (keys/anecdote.fpr) is read and stamped — exercised only when the operator hasn't set one.
if [ ! -f "$here/keys/anecdote.fpr" ]; then
  trap 'rm -f "$here/keys/anecdote.fpr"; rm -rf "$work"' EXIT
  printf '%s\n' "$VALID" > "$here/keys/anecdote.fpr"
  bin/floor-build "$work/file" >/dev/null 2>&1 || fail "build reading keys/anecdote.fpr should succeed"
  grep -q "PLATFORM_KEY = \"$VALID\";" "$work/file/pin.mjs" || fail "keys/anecdote.fpr not stamped"
  rm -f "$here/keys/anecdote.fpr"; trap 'rm -rf "$work"' EXIT
  ok "keys/anecdote.fpr is read and stamped"
else
  ok "keys/anecdote.fpr already set by operator — skipping the file-write case"
fi

echo "ok: floor-build — the pin stamps from a fingerprint, stays null without one, and refuses a malformed one"
