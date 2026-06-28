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

## How it works, in one breath

A respondent scans a QR that opens a prefilled GitHub Issue carrying an HMAC token bound to a specific
pile and poll. Tell **authorizes** the reply against that token (`bin/authz`), **governs** it when the
pile delegated a constitution (`bin/govern`, before sealing, on the still-public plaintext), **seals**
it `age`-encrypted to the pile and signed, and **publishes** it on a `feed/<scope>/<id>` branch. The
pile **pulls**; Tell never reaches into it.

```
QR (token) ──▶ public Issue ──▶ authorize ──▶ govern (when delegated) ──▶ seal + sign ──▶ feed/<scope>/<id>
                                                                                   │  the pile PULLS
                                                                                   ▼
                                                            transparency report (reports/govern-…)
```

**Three secrets, none of them decrypt.** `TELL_SIGNER_KEY` signs manifests, `TELL_SEED_IDENTITY` resumes
each pile's one-way ratchet, `TELL_QR_SECRET` mints poll tokens. The owner's pile holds the only key that
reads the sealed digest — Tell delivers what only the pile can open.

## The constellation place

The pile is the **principal**; Tell is its **agent**; Atlas is the **reporting-law layer** above. A pile
delegates its per-poll constitution to a Tell and revokes it by leaving; a Tell describes the transparency
reports it publishes and lists itself with an Atlas by a signed PR (`bin/register`, on a
`tell/<scope>/<id>` branch) so the public can find the piles it fronts. See [`CONTRACT.md`](CONTRACT.md)
→ "Registering with an Atlas."

## Develop & operate

Logic lives in `bin/` and local composite actions (`ingress`, `deliver`, `register`); workflows stay
thin. `ingest-submissions.yml` is a manual-dispatch template whose cron/issues triggers are commented
suggestions an adopter edits — cron is a knob, not a default. One-time signer/seed/QR-secret bootstrap is
in [`keys/README.md`](keys/README.md); the per-poll delegated rules are described in
[`_data/constitutions/README.md`](_data/constitutions/README.md).
