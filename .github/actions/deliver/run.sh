#!/usr/bin/env bash
# Core of the `deliver` composite action. Runs in the CONSUMER's checkout: it reads
# the consumer's pile registry, runs their rollup over their own jurisdiction's
# dataset, and produces + encrypts + signs + publishes each pile's feed to the
# consumer's OWN repo. Any repo that adds this action becomes its own Tell.
#
# Inputs arrive as env (set by action.yml):
#   REGISTRY            path to the pile registry (default _data/piles.yml)
#   ONLY_ID            deliver to just this pile id (blank = all)
#   ROLLUP_CMD         command that prints a pile's window digest (see resolution below)
#   SOURCE_NAME        feed source name written into each entry (default tell)
#   TELL_SIGNER_KEY    ssh private signing key (blank => unsigned, with a warning)
#   TELL_SEED_IDENTITY age identity for ratchet resume (required)
#   TELL_BIN           dir holding deliver/rollup/pile-lib.sh (defaults to this action's)
set -euo pipefail

action_dir="$(cd "$(dirname "$0")" && pwd)"
BIN="${TELL_BIN:-$action_dir/../../../bin}"
[ -x "$BIN/deliver" ] || { echo "::error::producer not found at $BIN/deliver"; exit 1; }

registry="${REGISTRY:-_data/piles.yml}"
[ -f "$registry" ] || { echo "::error::no registry at $registry"; exit 1; }
source_name="${SOURCE_NAME:-tell}"

[ -n "${TELL_SEED_IDENTITY:-}" ] || { echo "::error::TELL_SEED_IDENTITY required"; exit 1; }
export TELL_SEED_IDENTITY

umask 077
signkey=""
if [ -n "${TELL_SIGNER_KEY:-}" ]; then
  signkey="$(mktemp)"; printf '%s\n' "$TELL_SIGNER_KEY" > "$signkey"
else
  echo "::warning::no TELL_SIGNER_KEY — manifests will be unsigned"
fi

# Rollup resolution: explicit input wins; else the consumer's own bin/rollup (their
# dataset hook); else the bundled reference (placeholder records).
if [ -n "${ROLLUP_CMD:-}" ]; then rollup="$ROLLUP_CMD"
elif [ -x "./bin/rollup" ]; then rollup="./bin/rollup"
else rollup="$BIN/rollup"; fi
echo "using rollup: $rollup"

git config user.name  "tell-deliver"
git config user.email "tell-deliver@users.noreply.github.com"

# Parse the simple registry shape (id / scope / age_recipient) without a YAML dep.
targets="$(mktemp)"
python3 - "$registry" "${ONLY_ID:-}" > "$targets" <<'PY'
import sys, re
reg, only = sys.argv[1], sys.argv[2].strip()
cur, out = {}, []
def flush():
    if cur.get("id") and cur.get("age_recipient"):
        out.append((cur["id"], cur.get("scope",""), cur["age_recipient"]))
for line in open(reg):
    m = re.match(r'\s*-\s*id:\s*"?([^"\n]+)"?', line)
    if m:
        flush(); cur = {"id": m.group(1).strip()}; continue
    for k in ("scope","age_recipient"):
        mm = re.match(r'\s*%s:\s*"?([^"\n]+)"?' % k, line)
        if mm: cur[k] = mm.group(1).strip()
flush()
for id_, scope, recip in out:
    if only and id_ != only: continue
    print("\t".join([id_, scope, recip]))
PY

[ -s "$targets" ] || { echo "no deliverable piles (need id + age_recipient)"; exit 0; }

# The chain lives WHERE IT IS SERVED: piles/<id>/feed/ in this repo's tree (disk
# path == URL path; GitHub Pages publishes it, plain static files, CORS-open).
# No feed branches, no gateway — the branch paradigm made the forge itself too
# crucial for pickup access. Ordinary commits on the current branch; the Pages
# deploy that follows is the publish step.
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" != "HEAD" ] || branch="${GITHUB_REF_NAME:?detached checkout and no GITHUB_REF_NAME}"

delivered=0
while IFS=$'\t' read -r id scope recip; do
  serve="piles/$id/feed"
  echo "::group::deliver $id -> $serve"
  work="$(mktemp -d)"; mkdir -p "$work/inbox"
  # Resume from the served tree itself (manifest + seeds + blocks all live there).
  [ -d "$serve" ] && cp -a "$serve/." "$work/inbox/"

  block="$(mktemp)"
  "$rollup" "$id" "$scope" > "$block" || { echo "rollup failed for $id; skipping"; echo "::endgroup::"; continue; }
  if [ ! -s "$block" ]; then
    echo "rollup produced no data for $id; skipping (no delivery)"; echo "::endgroup::"; continue
  fi

  args=(--dir "$work" --recipient "$recip" --source "$source_name" --block "$block")
  [ -n "$signkey" ] && args+=(--signkey "$signkey")
  "$BIN/deliver" "${args[@]}"

  mkdir -p "$serve"
  cp -a "$work/inbox/." "$serve/"
  git add "$serve"
  head_seq="$(jq -r '.head.seq' "$serve/manifest.json")"
  git commit -q -m "deliver: $id seq $head_seq $(date -u +%FT%TZ)"
  delivered=1
  echo "committed $serve @ seq $head_seq"
  echo "::endgroup::"
done < "$targets"

# One push for the whole window; rebase-retry against concurrent Tell writes.
if [ "$delivered" = 1 ]; then
  for attempt in 1 2 3; do
    git push origin "HEAD:$branch" && break
    [ "$attempt" = 3 ] && { echo "::error::push failed after $attempt attempts"; exit 1; }
    git pull --rebase origin "$branch"
  done
fi
