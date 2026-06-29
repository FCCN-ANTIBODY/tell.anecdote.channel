# Reporting locus — rethink (raw captured thinking)

> Status: **raw idea capture**, not a spec. This is a working note from a design
> conversation about the "govern reports" / reporting-locus question and whether the
> current open PRs point the right way. Nothing here is decided or built.
>
> Branch context: this note is on `claude/govern-reports-tell-server-mgql8d`. The three
> open PRs it reacts to are on a *different* branch, `claude/subdomain-access-rules-hu1f7g`:
> - tell.anecdote.channel#26 — `docs/reporting.md` (the spec)
> - data-pile#13 — `docs/lifecycle.md` (pile as "backing, not reporting")
> - civic-node#51 — OPEN-QUESTIONS §C (records the decision)

## The starting problem

Today `bin/govern` writes `reports/govern-<ts>.json` as the Tell's public transparency
record. That report carries **per-record rows: the `answer` text and the `asker`**, each
tied to its verdict, the `constitution_sha` in force, and the Issue number. So the Tell's
compulsory public artifact today leaks every respondent's answer text. The open PRs react
to that by demoting per-record detail to sealed/pile-only and replacing the public artifact
with an **anonymous aggregate** (`tell.poll.summary/v1` → `reports/poll-*.json`), with
small-N suppression applied **at the Tell**.

## What the PRs get wrong: the aggregate is on the wrong layer

Making each Tell self-publish a compulsory public summary, with suppression at the Tell, is
self-defeating for small Tells:

- On a 2-person Tell every aggregate is N=2. Suppression either blanks everything (useless)
  or leaks (re-identifies two people). There is no `N_min` where a tiny Tell publishing its
  own summary is both safe and useful.
- It *feels like* every little server "telling the cops everything you say." That is not the
  compulsory report we want.
- **Suppression only works at the pooling layer**, where many Tells' arcs combine and N gets
  large. That layer is the **Atlas**, not the Tell.

Note the existing constitution already frames reporting as an **Atlas-shaped obligation**
("to be discoverable is to be addressable, and to report in a fixed shape… the shape that
Atlas's own constitution requires"). The PRs drift from "report = Atlas-facing delivery"
toward "report = self-published artifact." That drift is the thing to distrust.

So: **"compulsory" should mean compulsory as a condition of joining an Atlas**, delivered
into that opt-in relationship — not an always-on duty for every Tell to publish to the world.
A private Tell publishes nothing.

## The Tell / Atlas (anecdote) duality

The two roles are opposites, and that's the key:

- **Tell** — *solicited*. Has a per-poll constitution. Judges (`bin/govern`), seals.
  Trust comes from the posted rule + the attached judgment. Witness.
- **Atlas / anecdote** — *unsolicited, public, no constitution*. "Anecdote" is the act of
  dropping a claim onto strangers — foreigners talking to the platform; could be a bot.
  With no rule to lean on, trust can only come from **what the claim is made of** — its
  vouches, its metadata, its basis.

The jurisdiction-solve therefore belongs in the **Apex (anecdote / the client)**, at submit
time. The device **signs what it did**, and that signature is baked into **every respondent
row** going into the encrypted pile.

## Atlas as a registry of bounded concepts

- An Atlas keeps a **directory of districts**. Each district = **label + submitted boundary
  polygon + attestations of authority**. e.g. `state-name.anecdote.channel` hands anyone the
  district list for that state; the full picture is a **federated/amalgamated list across
  Atlases**, weighted by **group attestation** (how authoritative each boundary claim is).
- **Boundaries are the definition, not a detail.** "Has a submitted boundary" *is* the test
  for "this is a physical-world concern." No polygon → can't be a spatial jurisdiction. This
  generalizes far past electoral districts: watershed, forest, park, school catchment —
  anything with borders that is necessarily about physical space.

## Device-side vouch — this kills the location leak

Because boundaries are **public**, the client pulls the district list for where it resides
and tests "am I inside this polygon?" **locally, on the device**. Raw location **never leaves
the device**. What leaves is a **signed set of district memberships** — anonymized,
self-vouched.

This dissolves the earlier open worry ("is shipping constituency membership into the Atlas
seam too much?"): there is **no coordinate at the Tell to suppress**, because the row never
carried one. It only ever carried device-attested membership labels.

**The mechanism already exists.** `tell.voucher/v1` already has
`location{gradient,value,confidence}` + a `basis[]`. The evolution is:
1. move the vouch from server-side (`$TELL_VOUCH_CMD`) to the **device**, and
2. change its payload from a coordinate-gradient to a **signed district-membership set with
   a basis**.
Same seam (`bin/rollup` summary → `bin/deliver` promotes into `entries[].*` under `head.sig`),
evolved.

## Stiction — friction baked into every row

**Stiction** = the per-row, self-attested metadata that lets an anonymous claim carry weight
without ever naming a person. It is baked into every respondent row, sealed into the
encrypted pile. The vouch *is* the stiction. How finely a row is identified is open — even
"just the list of districts the Tell requires" (which only happens if the Tell cares about
those districts, e.g. proving a tokenized district to a Tell that wants it).

## Anti-Sybil: no eternal litmus test

We do **not** pick the criterion that defines "human." Bots will do whatever they can; we
watch the **water level on behavior** — what entities are actually capable of — and **mint
new metadata assertions** as the cat-and-mouse moves. Because the vouch is **gradable
metadata, not a pass/fail gate**, the system never has to claim it knows what a human is. Any
entity can keep proving itself at any level it wants; we just measure the level. Stiction is
**adaptive measurement, not a fixed gate**:
- a bare assertion is **weak** stiction;
- a GPS-backed / sensor / tokenized-district basis is **strong** stiction.
Anonymous, but weighable by what it's made of. "What they're made of is all-important."

## The govern JSON — repositioned, not demoted

The per-answer + judgment log is a powerful raw log; keep it. But it is an **evidence
locker**, not a publication:

- Stays **sealed** (system of record) in the `tell.digest/v1` block where it already lives.
- The Tell's real job is **single-record disclosure on a justified query** — never a bulk
  dump. Like a witness who can be asked for one record.
- The identity tie isn't really the `asker` field (usually *you*, the solicitor) — it's the
  **Issue number**: the Issue's GitHub author *is* the respondent. So a single disclosed
  record names a respondent — exactly what you want as the **basis for a harassment
  complaint**, exactly what's dangerous as a bulk surface. Hence query-scoped, justified,
  one row at a time.

## Moderation without an owner-operator

Falls out of the above; the constitution already forbids the operator move ("I do not drop
the answer, edit it, or keep it back" — the Tell can only *attach a verdict and seal*, no
delete button). So moderation is:
1. **Governance by posted rule** — moderate the *future* by amending the per-poll
   constitution, not by reaching into the log.
2. **Per-record recourse** — a targeted constituent pulls the *one* record aimed at them
   (query-scoped disclosure) as complaint basis; no operator privilege needed.
3. **Append-only dispute** — a contested verdict gets a recorded challenge, not an edit.

## Open seeds (let simmer)

- **Label-authority may equal report-credibility.** Anyone can draw a polygon and call it
  "Water District 4." The directory is easy; ranking competing/overlapping boundary claims by
  authority is the hard part — and it's the same "open line, weight accumulates" problem
  civic-node §C raises for *reports*. Suspicion: district-authority and report-credibility are
  **one attestation mechanism wearing two hats**.
- **Gradable, not trusted.** The `basis[]` is what makes a membership claim weighable rather
  than believed; this is the operational form of the anti-Sybil stance above.

## Where this diverges from the three open PRs

Agreements: per-record text shouldn't be a bulk public surface; reuse the seal-full /
project-coarse voucher precedent; no new crypto; pile backs via `bin/prove`.

Divergences:
1. The public aggregate + its suppression belong at the **Atlas (pool)**, not at each Tell.
2. The Tell's compulsory artifact is the **Atlas-facing delivery** (device-vouched,
   membership-tagged, de-identified rows / their signed summaries), produced **only** when
   attached to an Atlas — not a standalone self-published per-Tell summary.
3. The govern log is **re-homed** (sealed + single-record query disclosure), not "demoted."
4. The vouch moves to the **device** and becomes a **signed district-membership + basis**;
   geography never leaves the device.
