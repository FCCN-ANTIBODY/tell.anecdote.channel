# Open questions (Tell)

Deliberately-deferred design problems. Set aside, not forgotten. Each notes what it
**blocks** so we don't mistake "not yet decided" for "covered."

## 1. QR token expiry vs. round-bumping

A QR token is `HMAC(k_pile, "tok:"||pile||":"||poll||":"||round)` — a bearer capability with
**no intrinsic expiry**. Today the only way to retire an outstanding QR is to bump `round`
(or pin `TELL_ALLOWED_ROUND`), which is coarse and global, not per-poll, not time-based.

- **Blocks:** posters/printed QR with a defined lifetime; per-poll close dates; rotating a
  single poll without invalidating others; any "this poll closed on DATE" UX.
- **Sketch (unbuilt):** carry an `exp` inside the signed token preimage and check it in
  `bin/authz`; needs a per-poll registry to hold the schedule. Left out while we settle how
  much state Tell should keep about polls at all.

## 2. Identity model when the page POSTs to the GitHub API directly

Today the landing page only **builds a prefilled `issues/new` link**; the *respondent's own
GitHub account* posts the Issue (that is the spam/cost shield — Issue creation costs the
respondent a click and an account, not Tell its Action minutes). A future direction is the
page **POSTing to the GitHub API** using the QR's contents as config. That reopens *who
authenticates the POST*:

- the respondent's own token (then why not the existing link?),
- a service token embedded somewhere (a secret on a static page — no),
- a short-lived capability minted into the QR (ties back to **#1**, expiry).

- **Blocks:** any move away from the click-through `issues/new` model; one-tap replies; kiosk
  / no-GitHub-account flows.
- **Status:** the QR now *addresses* the correct jurisdiction Tell (`&repo=OWNER/NAME`, validated
  in `index.md`); the **identity** of the POST is unchanged and still deferred.

## 3. Registration idiom unification (`bin/register`)

A pile registers with a Tell by a PR appending to `_data/piles.yml` (`data-pile/handshake.yml`);
a need registers with an Atlas by a PR appending to `_data/needs.yml` (`data-pile/bin/need` +
`need.yml`). Same shape, implemented twice. A single `bin/register` + one PR-opening workflow
parameterized by target registry would unify them.

- **Blocks:** nothing functional — both flows work. This is idiom debt.
- **Deferred because:** it refactors working PR-opening code that needs `gh` + live repos to
  exercise; not safe to change blind. Do it with a real integration check.

## 4. Ingress loop as a composite action — DONE, with a cross-repo caveat

The whole ingress (collect → govern → deliver → finalize) is now the `ingress` composite
action (`.github/actions/ingress`), composing the `deliver` action. `ingest-submissions.yml`
is a thin template that wires it up and **defaults to manual dispatch** with cron/issues as
commented, editable suggestions.

What's **still open** is cross-repo adoption. The action composes cleanly when the *whole Tell
tree* is present (the main repo, or a fork/submodule). But referenced cross-repo
(`uses: OWNER/REPO/.github/actions/ingress@ref`), the steps and nested `deliver` use
repo-root-relative paths, and `bin/authz` / `bin/collect-submissions` resolve `_data/piles.yml`
relative to the bundled scripts — so a third repo would read *this* Tell's registry, not its own.

- **Blocks:** adopting ingress cross-repo while keeping your own piles/constitutions.
- **Sketch (unbuilt):** thread the consumer data paths (registry, constitutions, stage, reports)
  through env so the bundled scripts read the *workspace* rather than their own checkout — i.e.
  the same code-vs-data split the `deliver` action already makes for the registry. For now,
  adopt the whole tree (fork/submodule).
