# Reporting: the Tell's one compulsory artifact

This note settles **who reports** in the constellation and **what the report is**. The decision:

- **The Tell publishes one compulsory artifact — an anonymous, first-abstraction poll report.** It is
  "a self-description of the topic(s), not a public set of labels." It serves the Tell's own
  constituents — who otherwise cannot tell who is in the room beyond joined signatures — and it is
  **not** a discoverable strict deliverable.
- **The data-pile backs it in verifiable fact**, as discretionary *second-order raw proof*: the pile
  holds the sealed per-record data, disclosed only at the gatherer's discretion
  ([`data-pile/bin/prove`](https://github.com/FCCN-ANTIBODY/data-pile/blob/main/bin/prove),
  [`data-pile/docs/lifecycle.md`](https://github.com/FCCN-ANTIBODY/data-pile/blob/main/docs/lifecycle.md)).

This is **doc-only** and introduces **no new cryptography and no new signing step**. It extends one
mechanism the Tell already runs.

## Why a *new* aggregate, not the govern report

Today's transparency report `reports/govern-…` carries **per-record** rows — the answer text and the
`asker` ([`bin/govern`](../bin/govern); `CONSTITUTION.md` "I describe the transparency reports I
publish"). That is closer to a public set of labels than to a self-description of topics. Under this
decision the **per-record detail stops being a public artifact** — it rides **sealed to the pile**
inside the `tell.digest/v1` block, exactly where it already lives — and the Tell's *public,
compulsory* artifact becomes an **anonymous aggregate**: counts and a topic self-description, never
rows.

## The mechanism — extend the voucher precedent one step

The voucher already demonstrates the exact pattern (`CONTRACT.md` → "Seal the full voucher; project a
coarse one", lines ~192-198): `bin/rollup` emits a coarse `tell.voucher.summary/v1` (gradient
*histograms* and confidence *ranges*, **never a value**), and `bin/deliver` **promotes** it into the
**clear manifest entry** (`entries[].vouch`), where `head.sig` covers it — "signed and attestable
wherever the bytes are served."

Add a sibling that does for the **tally** what the voucher summary does for **location**:

**`tell.poll.summary/v1`** — emitted by `bin/rollup` per window, promoted by `bin/deliver` into
`entries[].poll`, covered by the same `head.sig`:

```json
{
  "schema": "tell.poll.summary/v1",
  "poll": "<poll slug>",
  "type": "multichoice | open",
  "count": 23,                               // responses sealed this window
  "options": { "Keep": 15, "Cut": 8 },       // multichoice only; omitted/suppressed otherwise
  "writeins": 0,                             // count only, never the text
  "verdicts": { "accept": 21, "held": 2 },   // anonymous verdict counts
  "topic": "<the poll's question/guidance>", // self-description, already public in /polls.json
  "constitution_sha": "sha256:…"             // which rule governed (ties to /polls.json)
}
```

It carries **no answer text, no `asker`, no per-respondent rows**. Open-type polls contribute
`count` + `topic` + `verdicts` only — never answer content.

### Anonymity floor (small-N suppression)

Coarse only, echoing `OPEN-QUESTIONS.md` §C ("coarse only, never per-respondent"): an `options`
breakdown is **omitted** when `count` is below a threshold `N_min` (a tally over one or two
respondents re-identifies them). Below the floor the summary still carries `count`, `topic`, and
`verdicts`; the option histogram is withheld until the floor is cleared. If any cell could single a
respondent out, the granularity is too fine.

## The compulsory report — a rollup of signed summaries

The Tell's published artifact `reports/poll-*.json` is a **rollup of the `entries[].poll` summaries**
across deliveries — per poll over time, plus a Tell-wide index of the poll universe (the "whole
universe of inner chatter … in a first abstraction"). It is the Tell's only compulsory centralized
output; keeping it to a first abstraction is what preserves the no-scaling story.

The report **need not be signed**, because its figures are already signed:

- **Manifest-committed.** Every summary rides in a **signed manifest head** (`head.sig` over the
  entries digest, [`bin/deliver`](../bin/deliver)). Anyone can **recompute `reports/poll-*.json` from
  the public manifests without decrypting** and confirm it matches. The report is a convenience
  projection of signed material — "never a new source of truth," the same stance as the feed-gateway
  `X-Tell-Vouch` header.
- **Provable raw (the pile backs it).** The sealed blocks hold the actual records. At the gatherer's
  discretion, `data-pile/bin/prove` discloses a ratchet checkpoint; a verifier then decrypts from
  there, confirms each plaintext hashes to the **Tell-signed** manifest, *and* confirms the records
  aggregate to the published summary. The anonymous report is thus falsifiable against the raw without
  the raw ever being public — second-order proof, on demand.

## Discoverability — Tell-local first, Atlas deferred

The compulsory report is published on the Tell's **own** surface and serves the Tell's constituents.
It is **not** a discoverable strict deliverable. Atlas roll-up (`OPEN-QUESTIONS.md` §C) remains the
**deferred, opt-in escalation**: when a Tell lists on an Atlas, the *same* signed `entries[].poll`
summaries are the raw material that aggregator consumes. So the Tell-side artifact is concrete and
compulsory **whether or not** Atlas is built — which eases §C's circular deadlock (each tier had been
deferring to the other until a real listed Tell published reports).

## What does not change

- Per-record answers, `asker`, and the full `tell.voucher/v1` stay **sealed for the pile** in the
  `tell.digest/v1` block — the pile is the system of record; the report is the first abstraction.
- The pile remains the principal: it may re-judge at its boundary; the report summarizes what the Tell
  *witnessed and sealed*, not what the pile ultimately keeps.
- No new key, no new signature: `tell.poll.summary/v1` rides under the existing `head.sig` exactly as
  `tell.voucher.summary/v1` does.

## Build surface (when this is implemented)

| Piece | Reuses |
| --- | --- |
| `bin/rollup` — also emit `tell.poll.summary/v1` per window | the same staged records it already rolls up; `bin/govern` verdicts |
| `bin/deliver` — promote the summary into `entries[].poll` | the existing `entries[].vouch` promotion path; `head.sig` covers it |
| `bin/poll-report` — roll `entries[].poll` across deliveries into `reports/poll-*.json` | the signed manifests on `feed/<scope>/<id>`; `/polls.json` topics |
| ingress wiring — run `bin/poll-report` after `bin/deliver` | the `ingress` composite action |
| `data-pile/bin/report` — read `reports/poll-*` as the backing-side aggregation | `bin/prove`, verified `state/<source>/manifest.json` |
