# The submission credential — per-Tell, public by design, scoped to its own repo

> Status: **posture, pinned before the code** (`bin/submit-bootstrap` and the QR-embed follow). The decision
> this records: how a respondent with no GitHub account posts into a Tell's mailbox without the apex domain
> owner ever holding anyone's credential. Companion to [`issue-ingress.md`](issue-ingress.md) (the `tok`
> gate), [`qr-provenance.md`](qr-provenance.md), and `anecdote.channel/composer/poll-answer.mjs` (the client
> that posts). See also `anecdote.channel/composer/egress-github.mjs` — the three-token discipline.

## The one hard fact: the token will be public

To let someone with **no GitHub account** post into a Tell's mailbox, *something* must carry a GitHub write credential,
and for an anonymous respondent scanning a **public** QR there is no channel to hand it to but the QR itself.
So the post credential **is public** — anyone who sees the poster has it. We do not pretend otherwise. This
is the ground-level case worth getting right, precisely because the token leaks by design.

Given that, the entire defense is **scope**, not secrecy:

- The credential is a **fine-grained PAT with `issues:write` on exactly one repo — the Tell's own** — and
  nothing else. Its whole blast radius is "comment into one already-public repo's poll threads." Revocable, rotatable,
  minted by the Tell operator on their own account. GitHub's own boundary (`one repo, issues only`) *is* the
  boundary we want around the token.
- **The `tok` HMAC is the real gate, and it is not public-mintable.** The post credential only lets you
  *knock* — create the draft. Whether the draft is *admitted* is decided at ingest by `bin/authz`, which
  verifies the per-poll `tok` derived from `TELL_QR_SECRET` (which never leaves the Tell). A submission
  without a valid `tok` is rejected/closed. So a leaked post credential buys spam that doesn't get admitted —
  it is a draft-maker, never an authority.

Two layers, cleanly separated: **the token opens the door; `tok` decides if you're let in.**

## The apex owns nothing — this is custody declined, not responsibility evaded

The credential belongs to the **Tell running it**, held by that Tell's operator, scoped to that Tell's repo.
The apex domain owner holds **zero** submission secrets — no central worker, no jar of other people's tokens,
no rotation duty, no breach surface for repos they don't own. That is the *correct* amount of responsibility
for a reference root: the atlas-index already calls the apex "a courier of addresses, never an authority over
them," and this makes the credential layer match the posture the data layer already has. Not holding other
people's credentials is the feature.

### The distributed jar

There is no central jar to manage. **Each Tell repo is its own single slot** — one token, one repo, held as
that repo's own secret (`TELL_POST_TOKEN`, the name `bin/qr` reads). Provisioning is self-service via
`bin/submit-bootstrap` (the `bin/boundary-bootstrap` pattern): because a GitHub PAT cannot be minted by a
script, the tool **captures + installs + validates** — it guides the operator to create the correctly-scoped
PAT, sets it as their repo secret, and confirms the scope. Rotate or revoke per-Tell, bothering no one.

### The registrar shape

This is the registrar vision applied to credentials: everyone runs their own, the code knows how to *prop one
up*, nobody bothers the top. A future registrar changes none of this architecture — it just runs the same
per-Tell bootstrap on the operator's behalf at registration time. Today's by-hand-per-operator is the manual
version of exactly that.

## Three consumption paths (they differ on exposure)

All three land the same way: a **comment on the poll's canonical issue** (`mode=comment`,
`bin/open-poll`, the QR's `canonical=`). Issue-per-response is retired for every credentialed path —
`bin/qr` refuses to mint it and the worker's allowlist is comments-only. The one new-issue path left
is the credential-free `issueUrl` fallback, where the respondent's own click is the authority (and so
needs none of the paths below).

1. **Worker-injected (the graduated form)** — the Tell's own **submit-gateway worker**
   ([`workers/submit-gateway/`](../workers/submit-gateway/)) holds the credential as a worker secret and
   injects it server-side; the QR carries only the worker's non-secret address (`su=`, minted by
   `bin/qr --submit-url`, dropped from the signed canon like `post`). Nothing durable rides in the QR.
   Custody stays per-Tell — the worker is the Tell's own — and the worker stays a **relay, not a
   gatekeeper**: it holds no `TELL_QR_SECRET` and performs no admission; `tok` still decides at ingest.
2. **Host-injected** — a chamber the operator controls holds the credential and passes it to the submit op
   transiently (what `poll-answer.mjs`'s `poll.submit` already takes). The token **never touches the QR**;
   nothing is exposed. This is the path for known participants using an operator's instance.
3. **QR-embedded (legacy fallback)** — for anonymous public with no worker, the token rides in the QR
   (public, as above) as the `post=` param.
   `bin/qr` embeds it and **`tl_qr_canon` drops `sig|kid|post|su`**, so neither the credential nor the
   worker address is ever part of the signed provenance preimage on the Tell side. The client **MUST
   likewise exclude `post` from the `qr` provenance field** it carries into the submission
   (`poll-answer.mjs` strips it from `rawQuery`) — it is a header-only bearer token, never part of the
   bytes a submission carries forward.

## Rejected

- **A central apex worker holding per-Tell secrets** — centralizes N credentials and their liability onto the
  apex owner, does not survive open Tell creation, and breaks the stateless grain. This is the design we
  caught before building.
- **A GitHub App** — a single App private key is just a different central custody; the codebase already
  declares "there is no GitHub App," and one key minting installation tokens for everyone re-centralizes the
  exact responsibility we are declining.

## Next

1. ~~Pin this posture~~ — this note.
2. ~~**`bin/submit-bootstrap`**~~ — **built**: captures/installs/validates the per-Tell PAT as the repo secret
   `TELL_POST_TOKEN` (guidance mode when no token; non-destructive repo-reach check; apex-free).
3. ~~**The QR-embed**~~ — **built** both sides: `bin/qr` embeds `post=` (dropped from the canon); the client
   reads it and strips it from the provenance field before submitting (`poll-answer.mjs`).
4. ~~**The worker shield**~~ — **built** (rework slice 1,
   [civic-node#57](https://github.com/FCCN-ANTIBODY/civic-node/issues/57)): `workers/submit-gateway/`
   holds the PAT server-side; `bin/qr --submit-url` mints `su=` instead of a credential; the runtime
   POSTs through the worker. The QR-embed remains the workers-less fallback.
5. **Judge summoning** — when the summonable judge lands (civic-node `OPEN-QUESTIONS.md` §A), the worker
   summons it over the `{verdict, reason}` contract before relaying; it never decides itself.
6. **The multitenant graduation** — hosted polls need the worker to act on *many* askers' authority
   without a token jar: the asker's own token, sealed under the Tell's secret, traveling in the poll's
   routing. Direction pinned in [`sealed-credential.md`](sealed-credential.md).
