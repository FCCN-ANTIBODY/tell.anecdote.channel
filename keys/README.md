# Tell keys, secrets & operating postures

Every Tell is a **sovereign node**: it holds its own keys and answers for its own polls,
boundaries, and deliveries. Nothing here is shared between Tells, and the apex domain owner
holds none of another Tell's material. GitHub is a **mirror and an addressable mailbox**, never
the authority — the signatures and capabilities below are what make a reply *worth processing*,
registry-free.

This file is the canonical reference for **what each key/secret is, and where it lives under each
way you might run a Tell.**

## Three operating postures (they mix freely)

A Tell can be run three ways, and one Tell can mix them phase by phase. Only **Mobile** is
structurally unique; **Hosted** and **Computer** are two flavors of "secrets in CI."

1. **Hosted** — someone (e.g. the reference operator) runs a bounded number of Tells on their own
   infrastructure and holds those Tells' secrets in their repos. A convenience for people who don't
   want to self-host. The secrets are still per-Tell; the host just keeps them.
2. **Computer** — GitHub Actions operate everything, with the secrets below set on the repo, at a
   distance. No offline app is ever contacted; you set the secrets and the workflows sign, mint,
   ingest, and deliver on their own.
3. **Mobile (offline origin)** — the operator holds their keys **on their device** (the Elevated
   app; `anecdote.channel/composer/sign.mjs` is the key factory) and mints/signs **locally**
   (`composer/qr-mint.mjs` → `poll.mint`). No workflow runs; GitHub is only the addressable inbox.
   This is the unique posture, and the one the offline-first design is built around.

**Workflows are strictly optional** — see [Workflows are optional](#workflows-are-optional--the-offline-end-vision).
Every phase a workflow performs has, or will have, an offline-origin mirror. Putting a repo on
GitHub is a deliberate — possibly *temporary* — move to be *addressable*; the data can be fetched
back from the GitHub mirror into the offline origin and collated there. The **workflow-less
operator is the end vision**, not a degraded mode.

---

## The keys & secrets, by category

Four categories, each referenced on its own below.

### 1 · Signing identities — a private half held, a public half committed

The Tell's provenance. Each has a **private** half (never committed; held per the posture) and a
**public** half (committed, so anyone can verify without a registry).

| Identity | Private (held) | Public (committed) | Signs | Provisioned by |
| --- | --- | --- | --- | --- |
| **Delivery signer** | `TELL_SIGNER_KEY` (ssh ed25519) | `tell.pub` · `tell.signers` · `tell.fpr` | inbound digest manifests (`bin/deliver`); QR provenance in CI (`bin/qr --signkey`); the peer registration commit (`bin/register`) | `bin/tell-bootstrap` |
| **Boundary signer** | `TELL_BOUNDARY_KEY` (ed25519 pkcs8) | `boundary.fpr` | `anecdote.boundary/v1` artifacts + lease renewals (`bin/boundaries`) | `bin/boundary-bootstrap` |
| **Device identity** *(Mobile)* | a non-extractable WebCrypto key in the phone's IndexedDB (`composer/sign.mjs`) | its allowed-signers line, added to `tell.signers` (`composer/qr-sign.mjs :: allowedSignersLine`) | QR provenance **on the phone** — a byte-compatible SSHSIG `bin/authz` accepts exactly like the CI one | the app, on first use |

The **device identity replaces the delivery signer's QR role** in the Mobile posture: the phone
signs the QR with its own key (published into `tell.signers`), so no ssh private key is needed on
the phone to mint a signed poll. `bin/authz` verifies either — same `tell.signers`, principal
`tell`, namespace `tell-poll`, **verify-if-present** (an unsigned, token-only QR still passes;
`TELL_REQUIRE_SIG=1` demands one). Because provenance is optional, `sig` is also the field you
**drop to shrink a QR** — a token-only QR is short.

### 2 · Capability secret — no public half

| Secret | What it is | Provisioned by |
| --- | --- | --- |
| **`TELL_QR_SECRET`** | 32 random bytes; the master from which every per-poll token derives: `k_pile = HMAC(TELL_QR_SECRET, "qr:"‖pile)`, `tok = HMAC(k_pile, "tok:"‖pile‖poll‖round)`. **One secret, any number of polls** — the token is *derived*, never stored. `bin/qr` / `poll.mint` mint it; `bin/authz` re-derives and verifies at ingest. | `bin/tell-bootstrap` |

It has no public half — the QR's `tok` is a bearer "this poll is open" capability, but only the
secret can *mint* one. In the **Mobile** posture the secret is held Elevated on the device and
`poll.mint` derives tokens locally (`composer/qr-mint.mjs`, byte-identical to `bin/qr`); the
powerless chamber can *request* a mint but never sees the secret.

### 3 · Transport credential — public by design

| Secret | What it is | Provisioned by |
| --- | --- | --- |
| **`TELL_POST_TOKEN`** | a GitHub fine-grained PAT with `Issues: Read and write` on **this one repo** — lets a respondent with no GitHub account post a reply. **Preferred home: the submit-gateway worker** ([`../workers/submit-gateway/`](../workers/submit-gateway/)), where it stays server-side and the QR carries only the worker's address (`su=`). The legacy fallback rides it in the QR (`post=`), **public by design**; either way its only defense is scope, and the `tok` HMAC still gates whether any issue is *admitted*. | `bin/submit-bootstrap`; `wrangler secret put` for the worker |

Full rationale in [`../docs/submission-credential.md`](../docs/submission-credential.md). With a
worker, `bin/qr --submit-url` emits `su=` and embeds no credential; without one, `bin/qr` embeds
`post=`. `tl_qr_canon` drops both from the signed canon; the client strips the credential from the
provenance field (`poll-answer.mjs`). In **Mobile**, the operator supplies it to `poll.mint`
directly (host-injected) — it need not be a repo secret at all.

### 4 · Not secrets — config & test seams

Never `gh secret set` these; they are plain configuration or test injection points:
`TELL_DOMAIN`, `TELL_REPO`, and the `*_CMD` / `*_DIR` / `*_JSON` / `*_DRYRUN` family
(`TELL_AUTHZ_CMD`, `TELL_JUDGE_CMD`, `TELL_VOUCH_CMD`, `TELL_ISSUES_JSON`, `TELL_SUBMISSIONS_DIR`,
`TELL_OPENPOLL_DRYRUN`, …). One transport token stands apart: **`ATLAS_PR_TOKEN`** — a GitHub
token used only by `register-atlas.yml` to open this Tell's registration PR to an Atlas.

---

## Where each lives, per posture

| Key / secret | Hosted (host's CI) | Computer (your CI) | Mobile (offline origin) |
| --- | --- | --- | --- |
| Delivery signer `TELL_SIGNER_KEY` | host repo secret | repo secret | QR provenance → **device identity**; digest-signing → the offline mirror *(end vision)* |
| Seed `TELL_SEED_IDENTITY` | host repo secret | repo secret | the offline mirror *(end vision)* |
| `TELL_QR_SECRET` | host repo secret | repo secret | **held Elevated on the device** (`poll.mint`) — no secret store |
| Boundary signer `TELL_BOUNDARY_KEY` | host repo secret | repo secret | **the operator, local compile** (already workflow-free) |
| `TELL_POST_TOKEN` | host's worker secret (per-Tell submit-gateway) | **worker secret** (submit-gateway); repo secret + QR-embed as the workers-less fallback | host-injected at mint; rides public in the QR only without a worker |
| Respondent identity | — | — | the **respondent's own** device (never a Tell secret) |

Built today: minting and boundary signing already have the Mobile path. Ingest and deliver are
CI-only for now — the same shape, movable to the app (see below).

---

## Provisioning

Three bootstraps, one per identity group. Each writes only public material to the repo and holds
the private half as a secret (or prints it once with `--no-secrets`). Re-running refuses to clobber
an existing signer unless `--force` (rotation makes consumers re-pin).

```sh
bin/tell-bootstrap        # delivery signer (TELL_SIGNER_KEY) + seed (TELL_SEED_IDENTITY) + TELL_QR_SECRET
bin/boundary-bootstrap    # boundary signer (TELL_BOUNDARY_KEY) → publishes keys/boundary.fpr
bin/submit-bootstrap      # capture/validate the submission PAT → sets TELL_POST_TOKEN (guides you to scope it)
git push                  # publish the committed public material (tell.{pub,signers,fpr}, boundary.fpr)
```

`--no-secrets` on any of them prints the value once for manual `gh secret set`; `--no-commit`
skips the commit. Delivery-signer files committed by `bin/tell-bootstrap` (all public):

| File | Purpose |
| --- | --- |
| `tell.pub` | Tell's public delivery-signing key |
| `tell.signers` | allowed-signers line(s) (`tell <key>`) — a pile copies this verbatim; a Mobile operator **adds their device line** here too |
| `tell.fpr` | `SHA256:…` fingerprint a pile pins in `pile.yml` `signer:` |

**No file to mount.** `bin/boundaries` reads `TELL_BOUNDARY_KEY` as **either a file path or the
base64 pkcs8 key content**, so CI passes the secret inline with nothing on disk:

```sh
TELL_BOUNDARY_KEY="${{ secrets.TELL_BOUNDARY_KEY }}" bin/boundaries renew   # content — no file
TELL_BOUNDARY_KEY=keys/boundary-signer.pk8            bin/boundaries renew   # path — local dev
```

After a boundary rotate, recompile so committed artifacts + `tell.yml` pins match the new signer:
`bin/boundaries compile`, repin the printed hash, `bin/boundaries check`.

Equivalent manual delivery-signer setup, if you'd rather not use the bootstrap:

```sh
ssh-keygen -t ed25519 -C tell-delivery-signer -f tell-signer   # private + .pub
gh secret set TELL_SIGNER_KEY < tell-signer                    # private -> CI secret
age-keygen -o tell-seed.identity                                # the ratchet-resume identity
gh secret set TELL_SEED_IDENTITY < tell-seed.identity          # private -> CI secret
bin/publish-signer tell-signer.pub                              # writes the 3 public files
git add keys/tell.pub keys/tell.signers keys/tell.fpr && git commit && git push
shred -u tell-signer tell-seed.identity                        # keep only the .pub + secrets
```

---

## Workflows are optional — the offline end vision

The `.github/workflows/*.yml` are a **convenience, not a requirement**. They're the Computer
posture: a fine way to run a Tell hands-off. But no workflow is *load-bearing* for a Tell to
exist, and each phase has an offline-origin counterpart:

- **Mint** (`qr.yml`) mirrors `composer/qr-mint.mjs` (`poll.mint`) byte-for-byte — the phone mints
  the whole QR, token and provenance, with the Tell minting nothing.
- **Boundaries** are a local `bin/boundaries` compile — already workflow-free.
- **Ingest** (`ingest-submissions.yml`, `bin/authz`) is the last workflow-shaped phase, and it will
  be **mirrored internally** too: putting the repo on GitHub is a deliberate move to be
  *addressable* — respondents post issues into a public inbox — but the offline origin can **fetch
  that data back from the GitHub mirror and collate it in safety**, verifying `tok` and provenance
  on-device. GitHub is the dumb mailbox; the judging happens where the operator is.

So the trajectory is a **workflow-less operator**: keys on the phone, GitHub as a temporary,
addressable mirror you pull from — not a place that holds authority or runs your logic. The
Computer posture stays first-class for anyone who wants it; it is simply never the only way.
The constellation-level continuation of this trajectory — multi-tenant custody, per-node
credentials, phone-native provisioning — is pinned in civic-node
[`docs/TENANCY.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/docs/TENANCY.md), with
the unbuilt parts tracked at
[`OPEN-QUESTIONS.md` §P](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md).

---

## What a pile owner does

1. Copy `tell.signers` here into the pile's `keys/tell.signers`.
2. Pin `tell.fpr`'s value into the pile's `pile.yml` `sources[].signer`.
3. Confirm the fingerprint over a second channel (in person, signed message, …).

That's the entire trust establishment — no installation, no privileged token. **There is no GitHub
App** anywhere in this design: every trust anchor above is an ordinary key an operator holds and a
public half anyone can pin.
