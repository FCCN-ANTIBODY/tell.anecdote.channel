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

## 5. Geolocation adherence in the judge, before public exposure

The judge (`bin/govern`) runs today *after* a reply is already a public Issue. Phase 1
(`ROADMAP.md`) requires authorization/judging to enforce **geolocation adherence** — a reply
counts only within its constituency's bounds — **before** anything is public. This is the gate
that lets a non-operator run a Tell without spilling unvetted plaintext.

- **Blocks:** distributed collection (others running their own Tell); pre-public sealing;
  retiring the public-Issue mailbox.
- **Sketch (unbuilt):** the `bin/authz` "type/asker-aware rules (rate, dedup, geo, …)" seam is the
  home; needs a source of constituency bounds and a trusted-enough location signal that does not
  drag respondent identity into the core (the tension in #2).

## 6. Direct-transfer collector (phone tool + daily-cron agent)

The Phase-1 ingress: a tool on the operator's phone web browser **buffers collected responses
locally** until the known window opens, and a **daily-cron agent** submits the legitimate batch
directly — instead of one GitHub Action per submission.

- **Blocks:** ingestion that scales with *legitimate* answers rather than with traffic/spam;
  windowed pickup; the move off public Issues.
- **Sketch (unbuilt):** local storage in the browser tool; a batch-submission format the ingress
  can authorize as a unit; the agent's cron *is* the legitimate-only pickup (contrast the current
  per-Issue trigger). Ties to #1 (window/expiry) and #5 (pre-public judging).

## 7. The Atlas reporting-law contract

`CONTRACT.md` → "The Atlas relationship" pins the *intent*: an Atlas requires the Tells it lists to
describe their transparency reports, and aggregates them into constituency/jurisdiction reports.
The concrete contract is unwritten because no Atlas repo is in scope.

- **Blocks:** a Tell knowing exactly what report shape to commit to; cross-Tell aggregation;
  scheduled constituency/jurisdiction reporting.
- **Sketch (unbuilt):** an Atlas `CONSTITUTION` clause naming the required `reports/govern-…` fields
  and cadence, plus a Tell-side declaration (already begun in `CONSTITUTION.md`) of the reports it
  publishes that an Atlas can validate. Lands when `atlas.anecdote.channel` is in scope.
