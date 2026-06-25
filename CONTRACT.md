# The Tell contract (responses in, encrypted digests out)

**Tell** is a jurisdiction's hub. It is the party an assembly *tells its data to*: it collects
responses, digests them, and publishes an encrypted, signed feed that the assembly's **data-pile**
pulls and owns. The same party you tell your data to is the party you pick your responses up from.

This document pins **Tell's** half of the inbound digest channel. The pile's half — crypto model
(forward hash ratchet, `age`-wrapped seed, signed hash-linked manifest), owner decrypt, and provable
disclosure — is specified in the data-pile template:
[`data-pile/CONTRACT.md`](https://github.com/FCCN-ANTIBODY/data-pile/blob/main/CONTRACT.md).

[Atlas](https://atlas.anecdote.channel) is a separate, public **index**: it lists Tells (and, through
them, piles) and reflects coarse public maps. Atlas never fronts pile data; Tell does.

## Direction: Tell publishes, the pile pulls

Tell **never reaches into a pile's repo**. It produces each fronted pile's chain on a
`feed/<scope>/<id>` branch in **this** repo and serves it at `/piles/<id>/feed/*`; the pile pulls,
verifies, and stores it. There is **no GitHub App, no cross-repo token** — Tell writes only its own
repo with the built-in `GITHUB_TOKEN`.

- **Store.** `bin/deliver` builds/extends the chain; `deliver.yml` commits it to `feed/<scope>/<id>`
  via a temp index + `commit-tree` (so the Pages build is untouched); `prune-pile-history.yml` bounds
  it. Each block is `age`-encrypted under its ratchet key `K_seq`; the manifest head is signed.
- **Serve.** `workers/feed-gateway/` serves `/piles/<id>/feed/<file>` from the feed branch's `inbox/`,
  CORS-open and cached. The payload is encrypted, so open serving leaks nothing. (No-Cloudflare dev
  fallback: pull the same files from `raw.githubusercontent.com` of this repo's feed branch.)
- **Pull.** The pile's `ingest` workflow fetches `/piles/<id>/feed/*`, verifies the signed manifest
  against the Tell signer it pinned, and persists the blocks into its own repo. No credential — the
  signature, not the transport, is what makes it safe.

## Two Tell keys, both ordinary primitives (no app)

- **`TELL_SIGNER_KEY`** — an SSH signing key. Tell signs every manifest head with
  `ssh-keygen -Y sign -n data-pile`. The **public** half is committed under `keys/`
  (`tell.{pub,signers,fpr}`, via `bin/publish-signer` / `bin/tell-bootstrap`); a pile pins it **by
  hand**, confirmed out-of-band / IRL — the whole trust handoff. The signed manifest travels with the
  data, so the untrusted public-fetch transport cannot weaken it.
- **`TELL_SEED_IDENTITY`** — a single `age` identity (secret; no committed half). It lets Tell resume
  each pile's one-way ratchet across windows without per-pile secrets: at genesis Tell draws `K_0` and
  writes both `inbox/seed.age` (wrapped to the pile, for the owner) and `inbox/seed.tell.age` (wrapped
  to Tell). Losing it only prevents *extending* a chain — never the owner's decrypt path.

## Registration (the consent gesture)

A pile registers with this Tell by opening a PR that appends its entry to `_data/piles.yml` (the
data-pile `handshake` workflow does this): `id`, `scope`, `feed/<scope>/<id>`, and the pile's
`age_recipient`. Accepting the PR is, for now, the whole of "attestation" — no formal attestation
layer yet. The pile separately pins this Tell's published signer fingerprint (`keys/tell.fpr`). No
write access to the pile is ever requested.

## Ingress: QR → authorized Issue → digest

A reply enters through Tell's **mailbox** — its GitHub Issues — and is gated by an HMAC capability the
Tell-runner mints:

- **Authorization (HMAC).** One master secret `TELL_QR_SECRET` (set by `bin/tell-bootstrap`) derives a
  per-pile key `k_pile = HMAC(TELL_QR_SECRET, "qr:"||id)`, never stored. A QR for pile `id` at `round`
  embeds `tok = HMAC(k_pile, "tok:"||id||":"||round)`. The token is a bearer "this poll is open"
  capability — public in the QR — but only the secret can *mint* one, so no one forges tokens for
  other piles/rounds. Bump `round` to expire an outstanding QR.
- **QR build.** `bin/qr <id> <round> [question] [opts]` (run by the `qr.yml` workflow with the secret)
  prints the landing URL `…/?pile&round&tok&q&opts`. This is "the runtime generates what future QR
  builds use."
- **Submission.** `index.md` reads that config and builds a **pre-filled `issues/new` link**; the
  respondent's click posts an Issue whose body carries a fenced ```tell``` JSON block
  `{pile, round, tok, answer}`. The page only builds a link — nothing phones home.
- **The ejected check.** `bin/authz <id> <round> <tok>` (overridable via `TELL_AUTHZ_CMD`, mirroring
  the rollup seam) re-derives `k_pile`, recomputes the HMAC, constant-time compares, and checks the
  round is open. Stricter rules (rate, dedup, geo, one-reply) plug in here.
- **Ingest loop.** `ingest-submissions.yml`: `bin/collect-submissions` reads open Issues, runs
  `bin/authz`, and **stages** only the authorized ones; the deliver action seals them; then
  `bin/finalize-submissions` closes each Issue — `ingested` for the abiding, `rejected` (with reason)
  for the rest. Tell writes only its own repo.
- **Exposure, named.** A raw answer is world-readable in its Issue between posting and sealing, so
  this channel is for **coarse, consented answers, not secrets** (see CONSTITUTION.md).

## The rollup seam (what each block carries)

What a block *contains* is isolated to one pluggable hook: the deliver pipeline runs `bin/rollup <id>
[scope]` (or `$TELL_ROLLUP_CMD`) once per window and seals its stdout as that window's block. Empty
output means "nothing new this window" and the pile is skipped. The default `bin/rollup` emits the
**authorized submissions `bin/collect-submissions` staged** for the pile — each block is the window's
batch of accepted answers, stamped with the Issue number that carried each (a literal ingress→egress
custody record). Everything downstream — encrypt, chain, sign, publish — is fixed production code.

## What Tell guarantees a pile

Each delivery on `feed/<scope>/<id>` MUST: `age`-encrypt every block to the pile's registered
`age_recipient`; hash every block into the signed `manifest.json` chain with a `ratchet_pub`
commitment; sign the manifest head with the key whose fingerprint the pile pinned; and stay reachable
at `/piles/<id>/feed/*`. The pile's `bin/verify` rejects anything else and fails closed.
