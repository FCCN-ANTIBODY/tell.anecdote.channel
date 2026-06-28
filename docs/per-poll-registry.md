# The per-poll registry

A poll has three kinds of data, with three different trust and write models. Today they are
scattered: the judge reads one file, the QR re-invents the poll's question in URL params, and
nothing holds a poll's lifecycle or per-respondent state at all. That scattering is the root of
several open questions at once (`OPEN-QUESTIONS.md` §J, §F, §K). This note is the consolidating
design: **one per-poll source of truth, read by every stage, with mutable state kept separate.**

## The three layers

| Layer | What | Who writes | Reviewed? | Lives |
|---|---|---|---|---|
| **1 — Config** | question, type, options, guidance, lifecycle | operator / `bin/poll` | yes — committed, PR-as-consent | `_data/constitutions/<pile>/<poll>.json` |
| **2 — Capability** | `pile,poll,round,tok` (+ optional `exp`) | `bin/qr` (minted) | no — it is a bearer token | the QR URL |
| **3 — State** | dedup ledger, tally, round status | the ingest job | no — never hand-edited | `state/<pile>/<poll>.json` *(unbuilt)* |

The discipline that makes this safe: **Layer 1 is slow, human-reviewed, signed-PR consent;
Layer 3 is fast, machine-written, append-only.** They must never share a file. Layer 2 is a
capability, not data — it carries the *authority* to answer, and nothing that the registry is
the authority on.

## Layer 1 — the config, now one source with two consumers

The per-poll **constitution** was already the source of truth for the judge
(`bin/govern`), and its README already said so: *"This registry is what governs."* The only
problem was that the judge was its **only** reader — the landing page re-declared the poll's
question/options/guidance as QR params (`q`, `opts`, `guidance`), free to drift from the rule
actually in force.

The fix is to give Layer 1 a **second consumer** without changing what it is:

- The files moved from `constitutions/` to **`_data/constitutions/<pile>/<poll>.json`**, so
  Jekyll's `site.data` can see them. They are still the delegated per-poll law; `bin/govern`
  still reads them (its default path and the `ingress` action's `constitutions-dir` default
  moved with them).
- The build renders a public projection to **`/polls.json`** — the same Liquid-over-`site.data`
  idiom as `/piles.json` — carrying each poll's renderable subset (`text`, `type`, `options`,
  `accept_writein`, `guidance`) plus its `lifecycle` block. Nothing private lives there;
  `guidance` is already shown to respondents.

A poll's `lifecycle` block is new:

```json
"lifecycle": {
  "round": 1,
  "opens_at": "2026-01-01T00:00:00Z",
  "closes_at": "2026-12-31T00:00:00Z",
  "one_per": "respondent"
}
```

`round` replaces the global `TELL_ALLOWED_ROUND` with a per-poll value; `opens_at`/`closes_at`
are the per-poll window; `one_per` declares the dedup policy. These are **declared** here in
slice 1; they are **enforced** in later slices (see below).

## How this closes the open questions

- **§J — shown ≠ judged.** The landing page fetches `/polls.json` and renders from it, instead
  of trusting QR render-hints. What a respondent is *shown* and what the Tell *governs* come
  from the same file. The submission then records *which version* it was shown (see "the sha
  question" below) and `bin/govern` reconciles.
- **§J — no authoring path.** `bin/poll` (unbuilt) writes the one Layer-1 file and mints the QR
  from it — one input, both artifacts, no divergence possible.
- **§F — QR expiry.** `bin/authz` reads the poll's `lifecycle.closes_at`/`round` and rejects a
  closed poll, per poll, retiring the coarse global `TELL_ALLOWED_ROUND`. An optional `exp` in
  the token preimage lets a *printed* QR self-expire without a round bump.
- **§F — one reply per respondent.** The Layer-3 ledger stores the dedup key; `bin/authz`'s
  existing dedup seam checks and records against it. (It stores a handle; it does not *mint*
  one — respondent identity is still the open §F question.)
- **§K — the shared window.** The pile's `bin/ingest` can read a poll's `closes_at` to know a
  round is sealed, and `deliver` flips the round's state closed. The `lifecycle` block is the
  window both sides honor, replacing two unrelated cron offsets.

It also answers the hesitation `OPEN-QUESTIONS.md` §F records — *"Left out while we settle how
much state Tell should keep about polls at all."* The answer is this table: static config under
review, a bounded isolated runtime ledger, both per-poll. That caveat can leave §F once the
state layer lands.

## The sha question (deferred within slice 2)

Closing the §J drift fully means the submission records *which version of the config it was
shown*, so the judge can reconcile. Liquid has no sha filter, so `/polls.json` carries no
`constitution_sha` today. The resolution (a later slice): either the landing hashes the
canonical fields client-side and carries that, or `bin/govern` reconciles the submission's
`shown_*` fields against the in-force constitution and flags drift. `bin/govern` already
computes and records `constitution_sha` on the *judged* side; the open piece is binding the
*shown* side to it.

## Slice plan

1. **Relocate + publish** *(this slice)* — constitutions move under `_data/`; `bin/govern` and
   the `ingress` action repoint; `/polls.json` is served; `lifecycle` is seeded in the examples.
   No behavior change yet — the registry is just now *published and singular*.
2. **Landing fetches the registry** — the page reads `/polls.json` for its `{pile, poll}` and
   renders from it; the QR shrinks toward a pure capability; the shown-version is recorded.
3. **`lifecycle` enforcement** — `bin/authz` honors per-poll `round`/`closes_at`; optional token
   `exp`; `TELL_ALLOWED_ROUND` retired.
4. **State ledger + dedup** — `state/<pile>/<poll>.json`; `bin/authz` one-reply-per-respondent.
5. **`bin/poll` authoring** — one gesture writes the config and mints the QR.

## Open sub-questions

- **Identity for dedup** — the ledger stores a handle; it does not source one. Still coupled to
  the §F "who authenticates the POST" question. This design unblocks *storage*, not *identity*.
- **Tally privacy** — Layer 3 must never publish per-respondent counts (coarse only — echoes the
  standing question, §C).
- **Per-poll files vs. one manifest** — `/polls.json` is a single flat array today (small,
  cacheable, one template). At scale, split to `/polls/<pile>/<poll>.json` via a generator that
  can also stamp the sha.
