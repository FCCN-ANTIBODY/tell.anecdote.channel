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

`bin/register` is also packaged as a **composite action** (`.github/actions/register`), so a forked
Tell lists itself with `uses:` — the code ships with the action, the identity (`tell.yml`, `keys/tell.fpr`)
is read from the *caller's* workspace (the code-vs-data split below, #4).

- **Blocks:** nothing functional — all three flows work. The remaining debt is that the data-pile's two
  descendent forms still re-implement the gesture inline instead of calling a shared `register`.
- **Deferred because:** the descendents register *differently-shaped* entries into *different* registries
  (`_data/piles.yml`: `id`/`scope`/`feed`/`age_recipient`; `_data/needs.yml`:
  `id`/`asker_repo`/`scope`/`topic`/`terms`). Folding them onto `register` needs a **registry-agnostic
  entry seam** (caller supplies the target registry + branch + a pre-built entry; `register` owns only
  the signed-PR mechanics) — a real refactor of working PR-opening code that needs `gh` + live repos to
  exercise. `bin/register`'s `{entry|branch|pr}` split is the shape they would adopt.
- **Coupled to a judgement gate — do not ship the seam without it.** A registry-agnostic `register`
  widens what one signed PR can carry from "list *me*" (identity, which the signature proves) to "commit
  *this bucket, backed by this logic*" (content, which it does not). That is safe **only if a fitness
  judgement is rendered** on the registrant's constitution at the consent junction
  ([atlas `OPEN-QUESTIONS.md` #5](https://github.com/FCCN-ANTIBODY/atlas.anecdote.channel/blob/main/OPEN-QUESTIONS.md));
  unattended, it steals base on consent and leaves the parent's operator to discover abuse of their own
  signature. The generalization and the judge are one decision, not two.

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
  the same code-vs-data split the `deliver` action already makes for the registry. The newer
  `register` action (`.github/actions/register`) is a worked example: `bin/register` reads identity
  from `TELL_YML`/`TELL_FPR_FILE` (workspace-relative, fail-closed) while its code ships with the
  action — ingress's bundled scripts want the same treatment. For now, adopt the whole tree
  (fork/submodule).

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

## 8. No constitutional judge at the pile→Tell consent junction

The summonable judge is becoming a strong idiom anywhere constitutions are compared, and the Tell→Atlas
tier has it contemplated in full
([atlas `OPEN-QUESTIONS.md` #5](https://github.com/FCCN-ANTIBODY/atlas.anecdote.channel/blob/main/OPEN-QUESTIONS.md)):
three consent intakes (PR / judge / unattended), the judge as a *junction* that degrades to the human
merge when it is unavailable (busy, rate-limited, out of budget, switched off, or uncertain), and a
fixed-bucket workload constraint so a judgement backlog can't masquerade as an outage. The **same junction
exists one tier down, and is just as unbuilt here**: a pile registers with this Tell by a signed-PR
handshake (`data-pile/handshake.yml` → `_data/piles.yml`), accepted by a human merge, and the Tell — the
**parent** at this tier — renders no *fitness* judgement on a registering pile's constitution before
fronting it. Only ownership/consent (the merge) is checked.

- **Blocks:** a Tell that wants to attest the piles it fronts cohere with its own constitution before
  listing them; the judge-when-it-can / human-when-it-can't junction at the pile tier; and — the live
  trigger — gating `bin/govern`'s delegated judging, which the pile hands the Tell, behind the same
  available/not-available junction rather than assuming the judge is always there.
- **Open here specifically:** authorization differs from Atlas — a Tell has **no `needs/` board**, so the
  Atlas-side handle for "this is a legitimate judgement request" does not exist a tier down. How a
  pile-tier judge request identifies and authorizes itself is its own unsettled question (cf. atlas #5's
  authorization bullet).
