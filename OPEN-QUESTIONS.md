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

## 4. Ingress loop as a composite action

`deliver` is already a reusable composite action; the surrounding ingress (collect → govern →
deliver → finalize) is still expressed as steps in `ingest-submissions.yml`. Each step is a
one-line script/action call, so the workflow is thin, but the *loop* is not yet a single drop-in
action a third repo could adopt wholesale.

- **Blocks:** a repo becoming a full Tell by adding one action (today it adopts `deliver` and
  re-creates the ingress steps).
- **Deferred because:** untestable here without Actions; low risk to leave, clear to extract later.
