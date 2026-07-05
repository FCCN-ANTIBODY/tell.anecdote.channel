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

## The offline parallel — where the worker is a ceremony, not a token-wielder

The sealed path above quietly assumes an edge exists to unwrap at. Two honest corrections
from working that assumption over:

**Per-Tell secret, per-workspace worker.** A per-Tell *worker* only exists where a Tell's
operator deploys an edge — most Tells deploy nothing anywhere. The real shape: one worker per
**workspace**, holding one sealing secret per Tell it services. That custody is exactly as
wide as TENANCY already declared hosting to be (the workspace owner has access-auth over the
Tells it runs, never the piles). A Tell with no edge at all simply doesn't offer `sc=` — the
credential-free `issueUrl` fallback remains. Which makes the offline case the primary case,
not the exotic one.

**The cached tell is structurally mute to the seal — correctly.** In the promiscuous sharing
path, an ambassador (a member of an Atlas or a Tell, or the poll's own author, carrying a
copy) has their QR scanned by a respondent, whose anecdote app opens the *offline* tell —
the canonical DNS name, served from their own service-worker cache. That shell holds no
secrets, by the dumb-shell/bind-the-queen rule, so offline answering can never route through
unwrapping. It needs a different authority: **possession plus presence.** The pieces mostly
exist:

- **Useless-if-found is already built.** The device identity is a non-extractable CryptoKey
  (anecdote `sign.mjs`); `gesture.mjs` gates its use behind a passkey ceremony whose
  challenge is the hash of the exact object signed — live human presence folded into the
  signature. Its noted-not-built follow-on (a WebAuthn-PRF-derived wrap key, so the identity
  is *cryptographically* unusable without the gesture) is precisely the "key every user
  makes that only a gesture unlocks."
- **Issue attestations, never secrets.** The permanent-credential trap ("the workspace could
  sign anything forever as that user") is what happens if the canonical Tell hands visitors
  an unwrap *key*. It must not. It hands a signed, short-lived **statement** about the
  device key — "visitor, epoch N." Verification is public; nothing stolen outlives the
  epoch; hygiene is ordinary re-attestation on contact plus per-use ratcheting. The
  credential to answer polls is a statement, renewed — not a key, held.
- **The in-person unlock is key agreement, not broadcast.** "Many payloads each wrapped for
  every key" is absent-audience thinking. The meet is *interactive*: X25519 agreement (age's
  own curve) derives the pairwise secret at the moment of contact from your private half and
  their public half — nothing pre-wrapped, no global material, and "a powerful key only
  unlockable by someone else's key" is literally what Diffie-Hellman is. The scan exchanging
  public halves + fresh nonces both ways, each side signing the transcript with its
  gesture-gated identity, is an authenticated key exchange — a solved shape.
- **The evidence is `met.mjs`, plural.** A met-record is already publicly re-verifiable
  in-person contact (anyone re-checks the Tell's signature, the body's signature, and the
  claim, holding no secret). A scan-gesture that also rolls a labeling task means one
  meet-session emits *multiple co-signed artifacts* — the receipts on every commingled
  step. The "dynamic, fairly high threshold" needs no new math: v1 is a **policy over the
  count and diversity of co-signed meet artifacts**, enforced at the consent-ladder rung,
  unlocked by gesture, hardened later by the PRF line. (Pinned limit: no crypto detects two
  *colluding* people faking a meet — the threshold raises fabrication's cost, never to
  infinity.)
- **Latecomers need first contact, not the secret.** There is no global secret to acquire:
  any ambassador's scan bootstraps the pairwise channel, and the introduction travels
  person-to-person the way `firmware-offer` already carries code offline to knock on the pin
  gate. The canonical Tell's role shrinks to signing attestations — verification public,
  unlocking pairwise. The "everyone needs it, so it can't be secret" paradox dissolves
  because what everyone needs is a verifiable statement, and statements are supposed to be
  public.

So the offline counterpart of this worker wields no token at all. Its output is **evidence,
not access**: an answer signed by device key + gesture + met-receipts + the poll's own
`tok`, held in a trove, delivered to the Tell's mailbox whenever either party next touches
the network. The online worker unwraps authority it was handed; the offline ceremony
*constitutes* authority from presence.

Open, and genuinely just these two: the **threshold policy** (what counts, how many, how
diverse, how it decays) and the **epoch/rotation economics** of visitor attestations. Design
choices — not missing cryptography.

## Next

1. ~~**The mint gesture**~~ — **built** (`bin/seal-credential`: mint/peek/mint-key, run
   wherever the operator holds `TELL_SEAL_KEY`; the confirm-gated browser op can follow).
2. **The `sc=` param** — the sealed cipher riding the poll's routing; dropped from the signed
   canon like `post`/`su`; stripped from provenance by the client the same way. (Client-side,
   anecdote `poll-answer.mjs` + `bin/qr` — the remaining wiring.)
3. ~~**The worker change**~~ — **built** (`workers/submit-gateway/seal.mjs` + the `sc` branch:
   AES-256-GCM, refuse-on-binding-mismatch to the bound poll's ONE issue, relay header-only,
   fails closed unprovisioned; the canonical Tell's own `TELL_POST_TOKEN` path unchanged).
4. **Retire `mode=issue` for hosted polls** — the comment paradigm becomes the paradigm.
