# Issue ingress — canonical-issue comment threads, runs, and the anecdote payload

> The Tell half of the egress anecdote.channel builds (`composer/egress-github.mjs`,
> `docs/egress-github.md`). It evolves the existing **QR → authorized Issue → digest** ingress
> (`CONTRACT.md`) to accept a response as a **comment on a canonical poll issue**, carry the
> constituent's **revocable nonce** through to the sealed digest, and identify which **run** a
> submission came through.

## Two mailbox shapes — one paradigm, one fallback

A submission is still a fenced ` ```tell ` block (`bin/authz` still gates on the HMAC `tok` bound to
`{pile,poll,round}`), and it can arrive two ways:

- **Comment submission — the paradigm.** A comment on the poll's **canonical issue**. `bin/open-poll`
  opens that one thread when the poll is made answerable; every response comments onto it. The
  comment's **position in the thread is a free, verifiable, contemporaneous ordinal** — *which cohort
  a response came in with* — gracefully better than a random, ever-increasing issue id. Comments carry
  no labels, so all metadata lives in the block. Every relayed/credentialed reply lands this way.
- **Issue submission — the credential-free fallback.** One issue per response, opened by the
  respondent's **own click** on a prefilled `issues/new` link (the runtime's `issueUrl`). That click is
  the authority — no relay, no credential. Minting `mode=issue` QRs is **retired** (`bin/qr` refuses);
  the shape survives only as this fallback and as history.

`bin/collect-submissions` sweeps both: open issues' bodies, and the comments of every open issue
labelled `tell-canonical` — so fallback replies and every historical issue still ingest. (Offline
seams: `TELL_ISSUES_JSON`, `TELL_COMMENTS_JSON`.)

## Making a poll answerable

```sh
n=$(bin/open-poll --pile cd04-q1 --poll budget --question "How should we spend it?")  # prints the canonical issue #
bin/qr --pile cd04-q1 --poll budget --round 1 --canonical "$n" --run spring-fair
```

`bin/open-poll` posts the canonical issue (an **anchor** block `tell.canonical/v1`, carrying no
answer/tok, so `collect` recognizes and ignores it) labelled `tell-canonical,poll:…,round:…`, and
prints its number for `bin/qr --canonical`.

## bin/qr — the new fields

- `--mode comment` (the default, and the only mode; `--mode issue` is refused — the retirement above);
  `--canonical <n>` — required for any **credentialed** QR (`submit=`/`post=`), since the runtime refuses a
  credentialed submit with no canonical thread. Omit it and the QR carries only the `issueUrl` fallback.
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

## Provisioning the post credential — the homebrew path (fine-grained PAT)

The deliberately-lowest-barrier setup, to prove a nobody can stand this up with no second-order infra
(no GitHub App, no token-vending worker — those are the graduation). One secret, set once:

1. **Make a fine-grained PAT** (github.com → Settings → Developer settings → Fine-grained tokens):
   - **Resource owner / repository access:** *only this one Tell repo*.
   - **Repository permissions → Issues: Read and write** — and nothing else. (Issues:write is what covers
     creating comments.)
   - **Expiration: short** (7–30 days). You rotate by bumping the poll **round** and re-minting.
   - For a true "nobody," generate it from a throwaway **machine account** that is a write collaborator
     on the repo, so it is not tied to your personal identity. (Your own account works too for a first run.)
2. **Store it** as the repo Actions secret **`TELL_POST_TOKEN`** (Settings → Secrets and variables →
   Actions). The *mint QR* workflow passes it through; if it is unset, the QR carries no credential and
   the landing falls back to the respondent's own GitHub auth.

**Eyes open about the blast radius (homebrew on purpose):** a fine-grained PAT scoped to Issues:write lets
*anyone holding the QR* create/close/comment on issues in that one repo via the API directly — the `tok`
gates *ingestion acceptance*, not raw GitHub actions. It is a public-inbox repo, so the cost is bounded;
keep the expiry short, rotate per round, and watch it. The App + scan-time-token model removes this by
never baking a durable credential into the QR — that is the next step, not this one.

## Operate it (from the Actions tab)

1. **bin/tell-bootstrap** once, *locally* (it sets `TELL_QR_SECRET` / `TELL_SIGNER_KEY` /
   `TELL_SEED_IDENTITY` via your own `gh` auth — there is no dispatch workflow for it on purpose; see
   below). Add `TELL_POST_TOKEN` per above.
2. **"open poll"** workflow → get the canonical issue number.
3. **"mint QR"** workflow with `canonical: <that number>` → the QR/landing the respondent opens.
   (One-issue-per-response is retired; leave `canonical` empty only for a fallback-only QR.)
4. **"ingest submissions"** sweeps, authorizes, governs, seals, and signals (label/close an issue;
   👍/👎 react a comment).

> **No dispatch workflow for `bin/tell-bootstrap`** — and that is correct. A workflow cannot write its
> own repo's Actions secrets with the built-in `GITHUB_TOKEN`; it would need an admin-scoped PAT, which
> is itself a manual setup secret (chicken-and-egg) and would mean printing freshly-minted **private**
> keys into a run log. So bootstrap stays a one-time local command where the operator holds the keys.

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
