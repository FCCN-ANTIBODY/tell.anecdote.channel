#!/usr/bin/env bash
# Core of the `register` composite action. Runs in the CONSUMER's checkout: it reads the
# consumer's OWN Tell identity (tell.yml) and published fingerprint (keys/tell.fpr), then
# opens a consent PR that lists THAT Tell on the Atlas — signed with the consumer's own
# delivery-signer key. The bundled bin/register is the CODE; the identity is the consumer's
# DATA. (Mirrors the code-vs-data split the deliver action makes for the pile registry.)
#
# Inputs arrive as env (set by action.yml):
#   ATLAS_REPO        the Atlas to register with
#   GH_TOKEN          Contents+PR write on the Atlas (blank => print the entry to paste)
#   TELL_SIGNER_KEY   ssh private delivery-signer key (blank => unsigned, with a warning)
#   TELL_YML          identity path in the workspace (default tell.yml)
#   TELL_FPR_FILE     fingerprint path in the workspace (default keys/tell.fpr)
#   TELL_BIN          dir holding the bundled register script (defaults to this action's)
set -euo pipefail

action_dir="$(cd "$(dirname "$0")" && pwd)"
REG="${TELL_BIN:-$action_dir/../../../bin}/register"
[ -x "$REG" ] || { echo "::error::register code not found at $REG"; exit 1; }

# DATA resolves to the CALLING repo's workspace (this step's CWD) — never the action's
# checkout. Fail closed if the consumer has no identity of their own: better to stop than
# to silently register the bundled template's Tell.
: "${TELL_YML:=tell.yml}"; : "${TELL_FPR_FILE:=keys/tell.fpr}"
[ -f "$TELL_YML" ] || { echo "::error::no Tell identity at '$TELL_YML' in the calling repo — add your own tell.yml; refusing to register another Tell's identity"; exit 1; }
[ -f "$TELL_FPR_FILE" ] || { echo "::error::no signer fingerprint at '$TELL_FPR_FILE' — run bin/tell-bootstrap and commit keys/tell.fpr"; exit 1; }
export TELL_YML TELL_FPR_FILE ATLAS_REPO

umask 077
if [ -n "${TELL_SIGNER_KEY:-}" ]; then
  keyf="$(mktemp)"
  printf '%s\n' "$TELL_SIGNER_KEY" > "$keyf"
  trap 'shred -u "$keyf" 2>/dev/null || rm -f "$keyf"' EXIT
  export TELL_SIGNER_KEY_FILE="$keyf"
else
  echo "::warning::no signer-key — the registration commit can't be signed; the ownership claim won't verify against $(cat "$TELL_FPR_FILE")"
fi

# `pr` prints the entry to paste when GH_TOKEN is blank, or opens the signed PR otherwise.
"$REG" pr
