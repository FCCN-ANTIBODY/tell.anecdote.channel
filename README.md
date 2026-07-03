# tell.anecdote.channel

**Tell** is a **jurisdiction's hub**: the addressable node that fronts data-piles. It collects replies
for the piles it fronts, judges each against the constitution that pile delegates to it, seals the
result encrypted to the pile alone, and publishes it on **its own** domain for the pile to pull. A pile
on its own has no address and nothing to answer for it; the Tell is both the party an assembly *tells
its data to* and the unit a directory ([Atlas](https://github.com/FCCN-ANTIBODY/atlas.anecdote.channel))
can list and address.

It is one connector in a constellation of `*.anecdote.channel` repos: a pile registers *to a Tell*; a
Tell registers *to Atlas(es)*. By convention the repo name is the DNS name served via GitHub Pages.

- **What & why:** [`CONSTITUTION.md`](CONSTITUTION.md) (the binding law) and the why-shaped map in
  [`AGENTS.md`](AGENTS.md).
- **The wire:** [`CONTRACT.md`](CONTRACT.md) — direction, the two keys, registration, the QR token
  scheme, and the ingress loop.
- **Where it's going:** [`ROADMAP.md`](ROADMAP.md). What's deferred for the whole constellation lives in
  one place, the workspace's
  [`OPEN-QUESTIONS.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md).
- **The poll, end to end:** how the Tell's authorize → govern → seal → publish loop sits inside the full
  lifecycle (and which steps are still operator chores) —
  [`civic-node/docs/PIPELINE.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/docs/PIPELINE.md).
- **The life of a Tell**, state by state — and which of its parts are live, mirrored, or vestigial —
  [`docs/lifecycle.md`](docs/lifecycle.md).

## How it works, in one breath

A respondent scans a QR and lands in the **answer runtime — `anecdote.channel/poll.html`** (this repo's
`index.md` forwards there verbatim; see [`docs/answer-runtime.md`](docs/answer-runtime.md)), which
composes the reply and posts it into the Tell's mailbox as a GitHub Issue or comment carrying an HMAC
token bound to a specific pile and poll. Tell **authorizes** the reply against that token (`bin/authz`),
**governs** it when the pile delegated a constitution (`bin/govern`, before sealing, on the still-public
plaintext), **seals** it `age`-encrypted to the pile and signed, and **publishes** it on a
`feed/<scope>/<id>` branch. The pile **pulls**; Tell never reaches into it.

```
QR (token) ──▶ answer runtime ──▶ public Issue ──▶ authorize ──▶ govern (when delegated) ──▶ seal + sign ──▶ feed/<scope>/<id>
                                                                                                      │  the pile PULLS
                                                                                                      ▼
                                                                               transparency report (reports/govern-…)
```

**Three sealed-side secrets, none of them decrypt.** `TELL_SIGNER_KEY` signs manifests,
`TELL_SEED_IDENTITY` resumes each pile's one-way ratchet, `TELL_QR_SECRET` mints poll tokens — plus one
**transport credential**, `TELL_POST_TOKEN`, a repo-scoped issues-only PAT that rides **public by
design** in the QR ([`docs/submission-credential.md`](docs/submission-credential.md)). The owner's pile
holds the only key that reads the sealed digest — Tell delivers what only the pile can open. The full
inventory, placed per operating posture, is [`keys/README.md`](keys/README.md).

## The constellation place

The pile is the **principal**; Tell is its **agent**; Atlas is the **reporting-law layer** above. A pile
delegates its per-poll constitution to a Tell and revokes it by leaving; a Tell describes the transparency
reports it publishes and lists itself with an Atlas by a signed PR (`bin/register`, on a
`tell/<scope>/<id>` branch) so the public can find the piles it fronts. See [`CONTRACT.md`](CONTRACT.md)
→ "Registering with an Atlas."

### Two hats, two things to configure (and the self-Atlas shortcut)

It's easy to lose track of *whose behalf* a run acts on, because one repo can wear two hats. They
configure separately:

- **Acting *as* a Tell — issuance & QR factorization.** Opening polls and minting QRs (`open-poll`,
  `qr`, `TELL_QR_SECRET`), and sealing pickups (`TELL_SIGNER_KEY` / `TELL_SEED_IDENTITY`). These are the
  Tell instrument's **own** behaviors — its own keys, no one else's grant required. This is what the
  canonical `tell.anecdote.channel` site/repo demonstrates.
- **Being *discovered* — registering with an Atlas.** `bin/register` opens a PR onto an Atlas's
  directory, which needs **write on that Atlas** (`ATLAS_PR_TOKEN`). That reach is a **consent gesture**:
  the Atlas you're joining grants it. You never get write on someone else's Atlas unless they consent —
  by design.

**The shortcut: be your own Atlas.** Nothing stops one server from running *both* a Tell and an Atlas
(this is what a personal **civic-node** does — Tell, Atlas, and pile, all in one workspace). When you are
also the Atlas, `ATLAS_PR_TOKEN` is simply a token to **yourself** — self-consent — and registration
becomes **the method to force discovery of yourself** when there is no external Atlas you'd rather join
to list you. Start self-listed; migrate to a community Atlas later by leaving (the pile is always the one
who can leave). A local workspace holding all the parts at once is the cleanest place to see this:
self-consent is still consent, present in every outcome.

## Three ways to run a Tell

The operating postures are pinned in [`keys/README.md`](keys/README.md): **Hosted** (a reference
operator holds a bounded number of Tells' secrets), **Computer** (your own repo and workflows hold
them), and **Mobile — the offline origin** (keys live on the device; `anecdote.channel` mints and signs
locally, and the **workflow-less operator is the end vision**). The workflows in this repo are the
Computer mirror of gestures the offline origin performs natively; where the split is going — the hosted
rework — is the workspace's
[`civic-node/docs/TENANCY.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/docs/TENANCY.md).

## Develop & operate

Logic lives in `bin/` and local composite actions (`ingress`, `deliver`, `register`); workflows stay
thin. `ingest-submissions.yml` is a manual-dispatch template whose cron/issues triggers are commented
suggestions an adopter edits — cron is a knob, not a default. One-time signer/seed/QR-secret bootstrap is
in [`keys/README.md`](keys/README.md); the per-poll delegated rules are described in
[`_data/constitutions/README.md`](_data/constitutions/README.md).
