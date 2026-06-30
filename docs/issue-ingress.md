# Issue ingress — canonical-issue comment threads, runs, and the anecdote payload

> The Tell half of the egress anecdote.channel builds (`composer/egress-github.mjs`,
> `docs/egress-github.md`). It evolves the existing **QR → authorized Issue → digest** ingress
> (`CONTRACT.md`) to accept a response as a **comment on a canonical poll issue**, carry the
> constituent's **revocable nonce** through to the sealed digest, and identify which **run** a
> submission came through.

## Two mailbox shapes

A submission is still a fenced ` ```tell ` block (`bin/authz` still gates on the HMAC `tok` bound to
`{pile,poll,round}`), but it can now arrive two ways:

- **Issue submission** — one issue per response (the original model). Labels can carry per-response
  metadata.
- **Comment submission** — a comment on the poll's **canonical issue**. `bin/open-poll` opens that one
  thread when the poll is made answerable; every response comments onto it. The comment's **position
  in the thread is a free, verifiable, contemporaneous ordinal** — *which cohort a response came in
  with* — gracefully better than a random, ever-increasing issue id. Comments carry no labels, so all
  metadata lives in the block.

`bin/collect-submissions` sweeps both: open issues' bodies, and the comments of every open issue
labelled `tell-canonical`. (Offline seams: `TELL_ISSUES_JSON`, `TELL_COMMENTS_JSON`.)

## Making a poll answerable

```sh
n=$(bin/open-poll --pile cd04-q1 --poll budget --question "How should we spend it?")  # prints the canonical issue #
bin/qr --pile cd04-q1 --poll budget --round 1 --mode comment --canonical "$n" --run spring-fair
```

`bin/open-poll` posts the canonical issue (an **anchor** block `tell.canonical/v1`, carrying no
answer/tok, so `collect` recognizes and ignores it) labelled `tell-canonical,poll:…,round:…`, and
prints its number for `bin/qr --canonical`.

## bin/qr — the new fields

- `--mode issue|comment` (default `issue`); `--canonical <n>` (required for comment mode).
- `--run <id>` — a **non-secret** id that tells QRs/runs apart ("identify the semi-public token"). It is
  provenance-covered (signed with the rest of the payload) and serialized onto each submission. Defaults
  to a short tag derived from the token; pass `--run` to distinguish several concurrent runs.
- **`$TELL_POST_TOKEN`** (env, optional) — the **semi-public POST credential** embedded so the runtime
  can post with **no GitHub account** from the respondent. It is **carried, never minted here**: supply
  a **repo-scoped, issues-only, short-lived** credential (a GitHub App installation token is ideal,
  rotated per round). It rides **after** the signature preimage and is excluded from `tl_qr_canon`
  (alongside `sig`/`kid`), so rotating it never invalidates the poll's provenance signature, and it is
  never part of any signed payload. Omit it to fall back to the respondent's own GitHub auth.

> The credential is a semi-public secret by construction (it is in the QR). Its blast radius is "anyone
> with the QR can comment on this one repo" — a public comment box, which is what a poll inbox is.
> Keep its scope minimal; the `tok` still gates **acceptance** (`bin/authz`), so a comment without a
> valid `tok` is swept `rejected`. A more secure variant fetches the credential from the Tell at scan
> time rather than baking it into a static QR — recorded as the hardening option.

## The block — three additions, forward-compatible

`bin/collect-submissions` reads the existing `pile/poll/round/type/asker/shown_guidance/answer/ts/tok`
**plus**:

- `nonce` — the constituent's revocable consent handle. **`bin/rollup` seals it into the digest**, so a
  pile that receives it can honor a later signed revocation (`anecdote.channel/composer/consent.mjs`).
  This is the cross-repo closure of the consent loop.
- `run` — which run/QR the submission came through.
- `anecdote` — the full **signed** `anecdote/v1` artifact; sealed into the digest beside the raw
  `answer`.

Staged records are tagged `source: issue|comment` (comments also carry `comment: <id>` and `number:`
the canonical issue). `bin/govern` preserves all of this (it only **adds** its verdict + voucher), and
`bin/rollup` carries it into the sealed `tell.digest/v1` record.

## Signalling the outcome (the async-status promise)

`bin/finalize-submissions` closes the loop so a respondent — and the runtime's detail view — learns
whether their input abided:

- **Issue** → label `ingested`/`rejected` and close it (the public record).
- **Comment** → **react** on the comment (👍 ingested / 👎 rejected); comments can't be labeled, so the
  reaction *is* the signal `egress-github.interpretStatus` reads back.

## Still open (cross-repo)

- **The landing/iframe wiring** on anecdote.channel: map the QR's `mode/canonical/run/post` params into
  the tunnel's `hello.egress`, so a scanned QR drives `build → sign → post` end to end. (This file makes
  the Tell *ready*; that wiring completes a live round-trip — the worked demo.)
- **Credential custody/rotation** and the fetch-at-scan-time alternative to a baked QR credential.
- **The per-poll comment ordinal** as published cohort metadata, and how contemporaneity is verified.
