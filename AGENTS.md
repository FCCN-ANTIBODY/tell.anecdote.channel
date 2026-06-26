# Orientation

This repository is one **Tell**: a jurisdiction's hub meant to be copied. The README and
`CONTRACT.md` cover *what* this is and *how* the wire works; `CONSTITUTION.md` is the binding
law; `ROADMAP.md` is where this is going. This file is the why-shaped map — the ideas
underneath that the others won't lead with.

## The thrust

- **Tell is the addressable node.** A data-pile is a mailbox plus a reader; on its own it has
  no address and nothing to receive for it. The Tell is both the party an assembly *tells its
  data to* and the unit a directory (Atlas) can list and address. A pile registers *to a Tell*;
  a Tell registers *to Atlas(es)*. Being your own Tell is fine technically — but a pile without
  a Tell is not discoverable, because there is no node to answer for it.
- **Authorize, judge-when-delegated, seal, publish — and never hold a reading key.** Three
  distinct gates, kept distinct: a token authorizes, a *delegated* constitution governs, and the
  pile's own key is the only thing that decrypts what Tell sealed. Tell holds a signer key, a
  ratchet seed, and a QR secret — none of which read the digest back.
- **Narrow the exposure window.** Replies enter today as public GitHub Issues, world-readable
  between posting and sealing. That is a named, *transitional* edge — not the destination. The
  direction (`ROADMAP.md`) is to judge before anything is public and seal at pickup, closing the
  window. Don't entrench the public-Issue mailbox as if it were the endpoint.
- **Replicable by design.** Fork it and stay a compatible Tell, or diverge and be your own group
  with the same socialization architecture and constitutions in flight. The PR layer is
  load-bearing: it is how humans consent to association. Keep identity out of the core.

## The shape of the system

- **Two directions, mirror images.** Inbound: Issues → authorize → govern (when delegated) →
  seal → publish a `feed/<scope>/<id>` branch. The pile **pulls**; Tell never reaches into it.
  Tell writes only its own repo with the built-in `GITHUB_TOKEN` — no GitHub App, no cross-repo
  token.
- **Three secrets, none of them decrypt.** `TELL_SIGNER_KEY` signs manifests, `TELL_SEED_IDENTITY`
  resumes each pile's one-way ratchet, `TELL_QR_SECRET` mints poll tokens. The owner's pile holds
  the only key that reads the sealed digest.
- **The token is the authority.** A QR carries an HMAC bound to `{pile, poll, round}`; a valid
  token *is* the authorization, so Tell keeps no poll/asker registry and no per-respondent
  identity. Keep it that way — identity stays out of this layer.
- **Logic in scripts and local actions; workflows stay thin.** `deliver` and `ingress` are
  composite actions; `ingest-submissions.yml` is a manual-dispatch template whose cron/issues
  triggers are commented suggestions an adopter edits. Cron is a knob, not a default.
- **Vendored crypto, guarded against drift.** `bin/pile-lib.sh` is data-pile's `bin/lib.sh`
  verbatim; `bin/check-pile-lib` fails CI on divergence. Producer (here) and consumer (the pile)
  must agree on the ratchet/manifest byte-for-byte.

## The constellation (pile ↔ Tell ↔ Atlas)

- **The pile is the principal; Tell is its agent.** The per-poll constitution lives here
  (`constitutions/<pile>/<poll>.json`), but the pile *delegated* it and revokes it by leaving.
  Tell attaches a verdict before sealing; it never decides what the pile keeps, and it withholds
  nothing it authorized.
- **Atlas is the reporting-law layer** *(intended; no Atlas repo in scope yet)*. An Atlas lists
  Tells to make them discoverable, and discoverability is not free: to be listed is to be
  addressable and to report in the shape that Atlas requires, because an Atlas aggregates the
  Tells it lists into constituency/jurisdiction reports. See `CONTRACT.md` → "The Atlas
  relationship".
- **Constitutions all the way up.** Each layer binds itself in the open and constrains the next:
  a pile's constitution delegates to a Tell's; an Atlas's constitution can require a Tell's to
  describe its transparency reports. Copyable constitutions are the point — a few sound ones let
  one careful operator serve many.

## Working here

- **Mirror the constellation's idioms.** Signed branches + a registry anchor, vendored crypto,
  PR-as-consent, thin workflows. Prefer the patterns already in the sibling repos
  (`data-pile`, Atlas) over new machinery, and keep dependencies near zero (`age`, `openssl`,
  `jq`, `git`).
- **Don't entrench the transitional.** The public-Issue mailbox and its plaintext window are
  named edges on a path (`ROADMAP.md`), not load-bearing assumptions. A change should *shrink*
  the exposure window, never deepen reliance on it.
- **Read the law, then the spec.** `CONSTITUTION.md` binds what Tell does; `CONTRACT.md` pins the
  wire; `OPEN-QUESTIONS.md` holds what's deferred; `ROADMAP.md` holds where this is going.
