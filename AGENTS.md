# Orientation

This repository is one **Tell**: a jurisdiction's hub meant to be copied — the addressable node.
A data-pile is a mailbox plus a reader; on its own it has no address. The Tell is the party an
assembly *tells its data to*: it authorizes each reply, judges it against the constitution the
pile delegated, seals it encrypted to the pile alone, and publishes it for the pile to pull. A
pile registers *to a Tell*; a Tell registers *to Atlas(es)*.

## Where the truth is, in reading order

1. **Demos before docs.** The constellation's capability index is the demo shelf in
   [`anecdote.channel`](https://github.com/FCCN-ANTIBODY/anecdote.channel) (`composer/*-demo.html`,
   `viewer/`, `git-enough/`, `reducer/demo.mjs` — its `AGENTS.md` carries the table). The QR mint,
   the poll-answer view, the gesture gate, and the submission tunnel this Tell depends on are all
   demoed there. Before designing a capability, look for its demo — if the need category is
   represented, the machinery exists. This repo's own executable truth is `test/run.sh`, the
   `bin/` tools, and `workers/submit-gateway/`.
2. **Open issues are urgent** — a live problem with the current implementation, ahead of the
   deferred backlog. Roadmapping does *not* live in issues; it lives in the documents
   (`ROADMAP.md`, civic-node `VISION.md`), and design writing is moving back into repo files, off
   the public issue surface.
3. **The deferred half lives in one place** — civic-node
   [`OPEN-QUESTIONS.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md).
   Record a deferral there rather than threading a caveat through the law or the spec.
4. **The law, then the wire.** `CONSTITUTION.md` binds what Tell does; `CONTRACT.md` pins the
   wire; `docs/` holds the shaping notes (solicitation — what a poll *is* and who frames one;
   qr-provenance, submission-credential, reporting, issue-ingress, per-poll-registry).

## The offline origin is the destination

Capability is migrating off GitHub and down to the operator's device — the anecdote.channel PWA,
where signing happens (the device is the second factor). The workflows and composite actions here
(`deliver`, `ingress`, `ingest-submissions.yml`) are being **kept as a declarative definition of
the pipeline** — a configuration input an operator or the offline origin can read and mirror —
not as the presumed runtime. Support them; don't deepen reliance on them. Whether or not GitHub
holds the secrets to run a workflow, the offline origin does.

## Invariants — violate these and you're building the wrong system

1. **Neighbors, not a graph.** No central authority; one hop; identity stays out of the core.
2. **Verify-from-anyone; trust decides *action*, not *admission*.** Anyone can check a signature;
   `keys/tell.signers` and the friend list decide whether to act.
3. **Witness, not judge — and never withhold.** Tell *attaches* a `governed` verdict before
   sealing; it never decides what the pile keeps and never withholds an authorized answer. `held`
   is the honest "unjudged" verdict, never a throttle.
4. **Sign ≠ decrypt.** Three secrets — `TELL_SIGNER_KEY`, `TELL_SEED_IDENTITY`, `TELL_QR_SECRET` —
   and none of them reads a sealed digest back. Only the pile's own key decrypts.
5. **Honest defaults fire nothing.** Cron triggers ship commented out; `bin/authz` defaults
   enforce nothing extra; automation is a knob an adopter turns.
6. **Attest before you run.** New conduct goes into `CONSTITUTION.md` in plain words before it is
   coded.
7. **The token is the authority.** A QR carries an HMAC bound to `{pile, poll, round}`; a valid
   token *is* the authorization, so Tell keeps no asker registry and no per-respondent identity.
8. **No new cryptography without cause.** `age`, `openssl`, `ssh-keygen -Y` (vendored via
   `bin/pile-lib.sh`, guarded by `bin/check-pile-lib`), `sha256`. Producer and consumer must agree
   byte-for-byte.

## Where intuition goes wrong here

- **Don't entrench the transitional.** Replies enter today as public GitHub Issues,
  world-readable between posting and sealing. That is a named *transitional* edge, not the
  destination — a change should *shrink* the exposure window, never deepen reliance on it.
- **Two directions, mirror images.** Inbound: authorize → govern-when-delegated → seal → publish
  at `piles/<id>/feed/*`. The pile **pulls**; Tell never reaches into it, and writes only its own
  repo with the built-in `GITHUB_TOKEN`.
- **The pile is the principal; Tell is its agent.** The per-poll constitution lives here
  (`_data/constitutions/<pile>/<poll>.json`) but the pile delegated it and revokes it by leaving.
- **Logic in scripts and local actions; workflows stay thin.**

## Built here — reuse, don't rebuild

`bin/qr` (mint; `--signkey` adds provenance signature; `--mode comment --canonical` targets the
one-thread mailbox), `bin/open-poll` / `bin/collect-submissions` / `bin/rollup` /
`bin/finalize-submissions` (the ingress loop), `bin/govern` (delegated judging), `bin/deliver`
(seal + signed manifest), `bin/register` (the canonical signed-PR registration — the idiom the
whole constellation mirrors), `workers/submit-gateway/` (the kiosk POST path),
`keys/custody.yml` + `bin/check-custody` (declared secret custody, enforced in CI).

House test style: `test/run.sh`, ssh-optional, dependencies near zero (`age`, `openssl`, `jq`,
`git`). Verify locally; CI is the final gate.
