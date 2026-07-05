# The sealed credential — stateless custody for hosted polls

> Status: **direction, pinned before the code.** Nothing here is built. The decision this
> records: how a submit worker can act on *many* askers' authority without holding a jar of
> their tokens — the multitenant version of the question
> [`submission-credential.md`](submission-credential.md) answered for the Tell's own mailbox.
> Companion to that note, [`workers/submit-gateway/`](../workers/submit-gateway/), and
> civic-node `docs/TENANCY.md` (the custody collapse; the rejected central custodian).

## The problem the existing posture doesn't cover

`submission-credential.md` settles the ground-level case: **one Tell, one mailbox, one
public-by-design token**, scope as the whole defense. The submit-gateway graduated that token
off the QR — but the worker holds it as *its own* secret, which only works because there is
exactly one.

Hosted polls break that arithmetic. Every person running a poll needs a credential that can
write **their** poll's chatter — responses, integration jitter, maintenance, crunching — onto
their own account's issue. A worker servicing all of them would need *many* tokens. A token
jar on the worker is the central custodian TENANCY already rejected; a GitHub App is the same
central key wearing a badge (and requires GitHub accounts, and forks us into a parallel
integration suite per non-GitHub platform). Both re-centralize exactly the responsibility the
per-Tell posture declines. And any of it, hosted at the canonical domain, is a **global
input** — the part that worries us most.

## The move: seal the token and hand the storage back

The asker supplies the credential — and that act **is the consent**: a scoped token that can
do exactly what we say we'll do (write comments and issue metadata on their poll's issue),
revocable by them, on their account, at any time. Nothing an App's backstage authorization
produces is as legible as that gesture.

We do not store it. We **seal** it — authenticated encryption under the Tell's own sealing
secret — and hand the **ciphertext back**, to travel in the poll's own routing the way every
other poll fact already does (the QR, the poll config; dropped from the signed canon like
`post` and `su`). The storage problem is solved by pushing the storage into the artifact.
There is no token database on the Tell, on a civic-node workspace, or anywhere else a seizure
could harvest.

At submit time the request arrives *carrying* its credential in sealed form, and the worker's
job becomes the one crucial role worth a worker at all:

1. **Vet** — prove the cipher is one of ours and intact (AEAD; a foreign or tampered cipher
   is noise).
2. **Refuse on binding mismatch** — the plaintext inside is not just the token but the
   binding: `{token, repo/issue it may write, pile, poll, scopes, minted_at}`. A request
   whose target doesn't match what's sealed inside is refused before anything is unwrapped
   into use.
3. **Act on the asker's authority** — relay the write with the inner token, header-only,
   never echoed. The worker is the integration bot on *whose authority* the chatter lands —
   without being an identity of its own.

The worker holds **one secret and zero tokens**. Even the Tell's own `TELL_POST_TOKEN` can
become just another sealed cipher — the uniform case, not a special one.

## What the seal buys

- **Blast radius: one issue.** A leaked ciphertext replays only toward its own poll's bound
  issue — strictly narrower than the public-by-design PAT it graduates from. Same two-layer
  discipline as ever: the (sealed) token opens the door; `tok` still decides admission at
  ingest, and the worker still performs none of it.
- **Revocation without state, twice over.** The asker revokes their PAT at the platform —
  consent withdrawal stays in *their* hands, because the credential was always theirs. The
  Tell rotates its sealing secret for bulk invalidation. A per-cipher denylist is the token
  database sneaking back in; resist it.
- **No global unwrapping point.** The sealing secret is **per-Tell**, and the submit worker
  was always one-per-Tell (`workers/submit-gateway/README.md`). A cipher minted by one Tell
  is noise to every other Tell's worker. The canonical domain is a global input only for
  polls that chose it as their mailbox.
- **Scale shards itself.** The worker stays stateless per-request. The real ceiling —
  platform API rate limits — divides **per asker**, because each poll's chatter spends its
  own asker's budget. (This is the quiet argument against the App: its installation identity
  would be the shared choke point. Hyperusers throttle themselves, not the commons.)
  Batching — coalescing a window's comments per issue — becomes an optimization to add when
  a busy Tell or an Atlas needs it, never a custody requirement.
- **Platform-generic.** Seal → vet → unwrap → relay doesn't care what the inner token opens.
  A non-GitHub forge with scoped tokens is another *flavor of cargo*, not another
  integration suite.

## What it forces, usefully

The cipher binds to **the** issue — one poll, one issue, all activity on it. Hosted polls
therefore structurally require the canonical-issue comment paradigm (`mode=comment`,
`bin/open-poll`, the `[8d]` sweep), which is the push that finally retires issue-per-response
(`mode=issue`) for everything except the credential-free `issueUrl` fallback, where the
respondent's own click is the authority.

## Rejected

- **A token jar** (worker KV, workspace secrets per asker, any at-rest mapping) — the central
  custodian again; does not survive seizure or open Tell creation.
- **A GitHub App** — central key, accounts required, per-platform suites; re-centralizes the
  declined responsibility (already rejected once in `submission-credential.md`).
- **A per-cipher revocation list** — state creeping back; both stateless handles above
  suffice.

## Next (all unbuilt)

1. **The mint gesture** — where an asker hands in their token and receives the cipher: a
   confirm-gated op or `bin/` tool on the Tell holding the sealing secret; never a page that
   ships the secret client-side.
2. **The `sc=` param** — the sealed cipher riding the poll's routing; dropped from the signed
   canon like `post`/`su`; stripped from provenance by the client the same way.
3. **The worker change** — accept `sc=`, AEAD-verify, refuse on binding mismatch, relay
   header-only; `TELL_POST_TOKEN` becomes a sealed cipher like the rest.
4. **Retire `mode=issue` for hosted polls** — the comment paradigm becomes the paradigm.
