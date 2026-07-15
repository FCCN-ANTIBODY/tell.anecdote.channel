#!/usr/bin/env bash
# Test bin/floor-build's PIN stamp (docs/decisions.md D1/D3): the platform pin is ENVIRONMENT-sourced, never
# committed. No env → the mirrored slot stays null (adapter inert); a valid ANECDOTE_PLATFORM_KEY → stamped
# into the built adapter/platform-key.mjs; a malformed one → the build FAILS. Run: test/floor-build.test.sh
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }
VALID="key:sha256:$(printf 'a%.0s' $(seq 1 64))"
PK="adapter/platform-key.mjs"

# 1. no env → the built slot stays null (the safe default; nothing operator-specific baked in).
( unset ANECDOTE_PLATFORM_KEY; bin/floor-build "$work/none" >/dev/null 2>&1 ) || fail "build with no env pin should succeed"
grep -q "PLATFORM_KEY = fromEnv;" "$work/none/$PK" || fail "no env → the slot should stay the env-sourced default"
! grep -q 'PLATFORM_KEY = "key:sha256:' "$work/none/$PK" || fail "no env → no fingerprint should be stamped into the export"
ok "no ANECDOTE_PLATFORM_KEY → the built pin stays the null slot (inert)"

# 2. a valid fingerprint in the environment → stamped into the built adapter/platform-key.mjs.
ANECDOTE_PLATFORM_KEY="$VALID" bin/floor-build "$work/set" >/dev/null 2>&1 || fail "build with a valid env pin should succeed"
grep -q "PLATFORM_KEY = \"$VALID\";" "$work/set/$PK" || fail "valid env pin not stamped"
ok "a valid ANECDOTE_PLATFORM_KEY is stamped into the built pin"

# 3. a malformed fingerprint → the build FAILS (no broken pin shipped).
if ANECDOTE_PLATFORM_KEY="key:sha256:nothex" bin/floor-build "$work/bad" >/dev/null 2>&1; then
  fail "build should reject a malformed ANECDOTE_PLATFORM_KEY"
fi
[ ! -e "$work/bad/$PK" ] || ! grep -q "nothex" "$work/bad/$PK" || fail "a malformed pin must never reach the built module"
ok "a malformed ANECDOTE_PLATFORM_KEY fails the build (no broken pin shipped)"

# 4. nothing operator-specific is committed in the repo (the whole point of D1).
! grep -q "key:sha256:[0-9a-f]" "$here/floor/adapter/platform-key.mjs" || fail "the committed slot must hold no fingerprint"
ok "the committed slot holds no fingerprint (environment-sourced, never committed)"

echo "ok: floor-build — the pin is env-sourced: stamped when the environment provides it, null when it does not"
