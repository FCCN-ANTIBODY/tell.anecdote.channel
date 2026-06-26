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

## 3. Registration idiom unification (`bin/register`) — canonical landed; descendents not folded in

The constellation registers by PR-as-consent at three tiers: a pile registers with a Tell
(`data-pile/handshake.yml` → `_data/piles.yml`); a need registers with an Atlas (`data-pile/bin/need`
+ `need.yml` → `_data/needs.yml`); and **a Tell registers with an Atlas** (`bin/register` +
`register-atlas.yml` → `_data/tells.yml`). The last is the **cleanest** version and the canonical home
of the paradigm — and the one that also **signs the registrant's ownership** (`tell/<scope>/<id>`
branch, signed commit, `signer` anchor).

- **Blocks:** nothing functional — all three flows work. The remaining debt is that the data-pile's two
  descendent forms still re-implement the gesture inline instead of calling a shared `register`.
- **Deferred because:** folding them in refactors working PR-opening code that needs `gh` + live repos
  to exercise; not safe to change blind. Do it with a real integration check. `bin/register`'s
  `{entry|branch|pr}` seam is the shape they would adopt.

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

## 7. The Atlas reporting-law contract — registration written; aggregation field-schema open

`atlas.anecdote.channel` is now in scope. The **registration** half is written: a Tell lists itself by
a signed PR (`bin/register`; `CONTRACT.md` → "Registering with an Atlas"), its entry carries a `reports`
pointer, and Atlas's `CONSTITUTION` now attests it requires that report description, **escalates
affirmatively** into all constituency aggregations, and keeps an **open line** (no strictness gate).
What's still open is the **field-level** report contract and the aggregator that consumes it.

- **Blocks:** a Tell knowing the exact `reports/govern-…` fields/cadence an Atlas validates; cross-Tell
  aggregation; scheduled constituency/jurisdiction reports.
- **Sketch (unbuilt):** an Atlas clause naming the required report fields + cadence, plus the Atlas-side
  job that pulls each listed Tell's `reports` and rolls them up (tracked in
  [atlas `OPEN-QUESTIONS.md` #2](https://github.com/FCCN-ANTIBODY/atlas.anecdote.channel/blob/main/OPEN-QUESTIONS.md)).
  The Tell-side declaration (`CONSTITUTION.md` → "I describe the transparency reports I publish") is the
  surface that contract validates.
