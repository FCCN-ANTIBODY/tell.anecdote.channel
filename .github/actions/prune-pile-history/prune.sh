#!/usr/bin/env bash
# Housekeeping for the "retain + periodic prune" custody choice. Feed branches are
# append-only signed-commit logs (one per fronted pile); left alone they grow forever.
# This bounds the LIVE ref while preserving the signed audit trail elsewhere.
#
# IMPORTANT (signatures): do NOT rebase/truncate a live branch in place — rewriting an
# ancestor changes descendant commit hashes and invalidates their signatures. Instead
# we ARCHIVE the intact pile-signed history to <archive-prefix><branch>@<date>, then
# reset the live branch to a single fresh snapshot of the current artifact. (The
# post-prune snapshot is signed by this workflow's key; subsequent placements are
# pile-signed again. The authentic pile-signed chain lives on, in the archive ref.)
#
# Env (all defaulted by action.yml): KEEP_DAYS, BRANCH_PATTERN, ARCHIVE_PREFIX, REMOTE,
# GIT_USER_NAME, GIT_USER_EMAIL.
set -euo pipefail

KEEP_DAYS="${KEEP_DAYS:-60}"
BRANCH_PATTERN="${BRANCH_PATTERN:-feed/*}"
ARCHIVE_PREFIX="${ARCHIVE_PREFIX:-archive/}"
REMOTE="${REMOTE:-origin}"

git config user.name  "${GIT_USER_NAME:-tell-prune}"
git config user.email "${GIT_USER_EMAIL:-tell-prune@users.noreply.github.com}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cutoff="$(date -u -d "-${KEEP_DAYS} days" +%s)"

# Each branch under the pattern is an independent, non-merging namespace.
for ref in $(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE/$BRANCH_PATTERN"); do
  branch="${ref#$REMOTE/}"
  root_epoch="$(git log -1 --format=%ct "$ref")"
  # Only touch branches whose newest commit predates the cutoff window;
  # actively-updated slices are left untouched.
  if [ "$root_epoch" -gt "$cutoff" ]; then
    echo "skip $branch (fresh)"; continue
  fi
  echo "prune $branch -> ${ARCHIVE_PREFIX}${branch}@$stamp"
  # 1) Preserve the intact signed chain.
  git push "$REMOTE" "$ref:refs/heads/${ARCHIVE_PREFIX}${branch}@$stamp"
  # 2) Reset the live ref to a lean snapshot of the current tree.
  git checkout --quiet "$ref" -- . 2>/dev/null || true
  tree="$(git rev-parse "$ref^{tree}")"
  new="$(printf 'prune: snapshot %s at %s\n' "$branch" "$stamp" | git commit-tree "$tree")"
  git push --force "$REMOTE" "$new:refs/heads/$branch"
done
