# Roadmap — Tell

Where this is going, and why today's shape is a way-station. `CONSTITUTION.md` binds what Tell
does *now*; this file is the direction, so an agent reading the code doesn't mistake a
transitional edge for the destination. The unsolved mechanisms each phase depends on are tracked
in the workspace's
[`OPEN-QUESTIONS.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md).

## The principle: narrow the exposure window

A reply enters as a public GitHub Issue and is world-readable between its posting and Tell's
sealing of it (`CONSTITUTION.md` → "What I do not hide"). That window is the thing to shrink and
then eliminate. The lever is *when judging happens*: move it earlier — before anything is public —
and sealing can happen at pickup, so unmoderated plaintext never sits in the open at all.

## Phase 0 — one vouching collector (today)

The operator is the **only empowered collector**, and the first live reports are
operator-controlled. A report in this phase is "hearsay" in a precise sense: the operator
**vouches** for a vote someone else gave — attributed, and standing behind it as the one party
empowered to collect. Public Issues are the ingest mailbox and the plaintext window is real,
accepted as a named transitional edge. The point of the phase is a *small trust surface* while the
constitutions and the judge are still settling: one collector, vouching, in the open.

## Phase 1 — distributed collection behind pre-public judging

Others run their own Tell. The gate that unlocks this: the judge runs with **geolocation
adherence** (and the rest of the authorization rules) effective **before anything reaches public
Issues or comments**. Once judging is pre-public, the digest can be **encrypted during pickup** —
and the public-Issue holding structure becomes redundant. If kept at all, it survives only as a
published digest-summary log for public benefit, never again as a place that holds unmoderated
data *first*.

The collector changes shape with it: a **direct-transfer ingress agent**. A tool on the operator's
phone web browser — **`anecdote.channel`, the offline origin runtime** ([`keys/README.md`](keys/README.md)
→ the Mobile posture) — **buffers collected responses locally** until the known window opens; a
**daily-cron agent** then submits the legitimate batch directly. The buffer and the agent are the
unbuilt extension of that runtime. The cron lives on the agent — one
scheduled pickup of vetted submissions — rather than firing one GitHub Action per submission, which
scales with traffic and with spam instead of with legitimate answers.

## What this means for today's code

- The public-Issue mailbox (`CONTRACT.md` → "Ingress") is **Phase-0 machinery**. Don't entrench it.
- `bin/authz`'s "stricter, type/asker-aware rules (rate, dedup, geo, …)" seam is exactly where the
  Phase-1 pre-public judging — geolocation adherence — lands.
- The transparency reports (`reports/govern-…`) are the durable artifact *across* phases, and the
  raw material an Atlas's reporting law aggregates upward (`CONTRACT.md` → "The Atlas relationship").

## Open mechanisms

Tracked in the workspace's
[`OPEN-QUESTIONS.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md): the
Phase-0 → Phase-1 transition — geolocation adherence in the judge, the direct-transfer collector tool +
agent cron, and the QR-expiry and POST-identity questions that bear on closing the exposure window —
is gathered under "F. Tell: public mailbox to pre-public pickup"; the Atlas reporting-law contract is
under "C. Aggregation, reporting-law, and standing".
