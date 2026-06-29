# Reporting: the Tell's compulsory artifact is its Atlas-facing delivery

This note settles **who reports**. It supersedes an earlier draft that had each Tell self-publish a
compulsory anonymous aggregate; the reporting-locus rethink
([PR #27, `notes/reporting-locus-rethink.md`](https://github.com/FCCN-ANTIBODY/tell.anecdote.channel/pull/27))
showed that aggregate sits on the wrong layer. The corrected decision:

- **A standalone Tell publishes no public report.** Reporting is an **Atlas-shaped obligation**, as the
  Tell `CONSTITUTION` already frames it ("to be discoverable is to be addressable, and to report in a
  fixed shape… the shape that Atlas's own constitution requires").
- **The Tell's one compulsory artifact is its Atlas-facing delivery** — de-identified, membership-tagged
  rows and their signed summaries — produced **only when the Tell is attached to an Atlas**. "Compulsory"
  means *a condition of joining an Atlas*, not an always-on duty to publish to the world.
- **The public aggregate, and its small-N suppression, live at the Atlas (the pool)** — never at each
  Tell.
- **The govern log is re-homed, not demoted**: it stays sealed (system of record) and is disclosed **one
  record at a time, on a justified query** — an evidence locker, not a publication.
- **The data-pile still backs it in verifiable fact** as second-order raw proof
  ([`data-pile/docs/lifecycle.md`](https://github.com/FCCN-ANTIBODY/data-pile/blob/main/docs/lifecycle.md)).

This is **doc-only**, introduces **no new cryptography and no new signing step**, and keeps the
seal-full / project-coarse mechanism the Tell already runs.

## Why the aggregate is on the Atlas, not the Tell

Small-N is decisive. On a two-person Tell every aggregate is N=2 — suppression either blanks everything
(useless) or re-identifies the two people (a leak). There is **no `N_min` at which a tiny Tell publishing
its own summary is both safe and useful**. Suppression only works where many Tells' arcs combine and N
grows large, and that pooling layer is the **Atlas**. A per-Tell self-published summary also *feels* like
every little server reporting everything its constituents say — which is not the report we want.

So the Tell does not publish an aggregate. It **delivers** to the Atlas it has joined; the Atlas pools
across Tells and produces the suppressed constituency aggregate (`OPEN-QUESTIONS.md` §C — the aggregator
is where aggregation belongs).

## The mechanism — unchanged, but the consumer is the Atlas

The voucher already does *"seal the full, project a coarse one"* (`CONTRACT.md` §"Vouching", ~lines
192-198): `bin/rollup` emits `tell.voucher.summary/v1` (histograms + ranges, **never a value**), and
`bin/deliver` promotes it into the **signed manifest head** (`entries[].vouch`, covered by `head.sig`).

The reporting delivery rides the **same seam**: a per-window **`tell.poll.summary/v1`**
(`count`, coarse option tallies, verdict counts, the poll's topic; **no answer text, no `asker`, no
per-respondent rows**) promoted into `entries[].poll` under the same `head.sig`. The difference from the
earlier draft is only **where it goes and who suppresses**:

- It is **not** rolled into a per-Tell public `reports/poll-*.json`.
- It is part of the **Atlas-facing delivery** the Atlas pulls when this Tell is listed.
- **The Atlas applies small-N suppression at the pool** and publishes the constituency aggregate. The
  per-Tell summary is an input to that pool, signed and recomputable from the Tell's manifests — never a
  standalone public surface. A Tell with no Atlas produces these summaries for no one.

## The govern log — sealed evidence locker, single-record disclosure

The per-answer + judgment log (`bin/govern`'s rows: `answer`, verdict, `constitution_sha`, the Issue)
is a powerful raw log. It is **kept, sealed, and re-homed** — not turned into a public artifact:

- It stays **sealed** in the `tell.digest/v1` block where it already lives (system of record).
- The Tell's job is **single-record disclosure on a justified query** — like a witness asked for one
  record — **never a bulk dump**.
- The real identity tie is **the Issue author**, not the `asker` field (the `asker` is usually the
  solicitor — *you*). The Issue's GitHub author *is* the respondent. So one disclosed record names a
  respondent: exactly what makes it a valid **harassment-complaint basis**, and exactly what is dangerous
  as a bulk surface. Hence query-scoped, justified, one row at a time.

**Moderation without an owner-operator** falls out of this and the existing constitution ("I do not drop
the answer, edit it, or keep it back"): (1) govern the *future* by amending the per-poll constitution,
not by reaching into the log; (2) a targeted constituent pulls the *one* record aimed at them as
complaint basis; (3) a contested verdict gets an append-only recorded challenge, not an edit.

## The pile backs it — unchanged

The figures the Atlas pools are committed in **Tell-signed manifest heads** the pile holds, so they are
recomputable without decryption; the pile's `bin/prove` discloses raw blocks on demand to substantiate
any figure (and single-record disclosure above is the per-row form of the same proof). Per-record detail
never becomes a public surface; the pile is the system of record, the Atlas pool the first public
abstraction.

## Forward seeds (recorded, not specified here)

The rethink opens a larger arc; capture it, don't spec it yet:

- **Device-side vouch.** Move the vouch from the server (`$TELL_VOUCH_CMD`) to the **device**, and change
  its payload from a coordinate-gradient to a **signed district-membership set + `basis[]`**, computed
  locally against Atlas-published boundary polygons — so **raw geography never leaves the device**. This
  dissolves the "is shipping constituency membership too much?" worry: there is no coordinate at the Tell
  to suppress, because the row never carried one. Same promotion seam, evolved payload.
- **Atlas as a registry of bounded concepts.** A district = label + submitted boundary polygon +
  authority attestations; "has a boundary" *is* the test for "a physical-world concern" (generalizes past
  electoral districts — watershed, park, catchment).
- **Stiction** — per-row self-attested metadata that lets an anonymous claim carry weight without naming a
  person; the vouch *is* the stiction.
- **Gradable, not trusted anti-Sybil.** `basis[]` makes a claim *weighable* (bare assertion = weak;
  GPS/sensor/tokenized-district = strong) rather than pass/fail. No eternal "what is a human" gate; measure
  the behavioral water level and mint new gradable assertions as the cat-and-mouse moves.
- **Label-authority may equal report-credibility** — ranking competing boundary claims by authority looks
  like the same "open line, weight accumulates" mechanism §C raises for report credibility; suspect one
  attestation mechanism wearing two hats.

## What does not change

- No new key, no new signature: `tell.poll.summary/v1` rides under the existing `head.sig`, exactly as
  `tell.voucher.summary/v1`.
- Per-record answers, `asker`, and the full `tell.voucher/v1` stay sealed in the `tell.digest/v1` block.
- The pile remains the principal and the backing; the Atlas remains the aggregator.

## Build surface (when this is implemented)

| Piece | Reuses |
| --- | --- |
| `bin/rollup` — also emit `tell.poll.summary/v1` per window | the staged records it already rolls up; `bin/govern` verdicts |
| `bin/deliver` — promote the summary into `entries[].poll` | the existing `entries[].vouch` promotion path; `head.sig` |
| Atlas-side aggregator — pull listed Tells' summaries, suppress at the pool, publish constituency report | `OPEN-QUESTIONS.md` §C; the `reports` registry pointer |
| govern-log disclosure — single-record, justified-query | `bin/prove` single-block disclosure; the Issue-author tie |
| `data-pile/bin/report` / `bin/prove` — back any figure on demand | verified `state/<source>/manifest.json` |
