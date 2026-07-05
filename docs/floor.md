# The Floor — a barren template served on any `<name>.tell.anecdote.channel`

Implements the hosting half of anecdote.channel#93 (with #92's wildcard-origin story
underneath it). The Floor is a template this repo builds and publishes for others to
host: a blank slate, available offline, **identical on every name a user chooses**.
The one variable — the hostname's leading label — is not content. It is the **name of
the data-pile** this room stages for.

## The alias rule

The label **is** the actual pile-name component. No registry maps Floor names to
piles; the mapping is the identity function. A user who finds a pile in their system
as `anecdote://data/some-pile-name` reaches its Floor at
`some-pile-name.tell.anecdote.channel` — same string, no lookup, nothing to attest.

Consequences, enforced where they bite:

* The label must be a valid pile slug (`^[a-z0-9][a-z0-9-]*$`, data-pile
  `bin/pile-new`'s rule) **and** a valid DNS label (≤ 63 chars — a bound the alias
  rule adds to pile naming itself; data-pile's `bin/pile-new` now checks it at mint).
* Exactly one label deep. `a.b.tell.anecdote.channel` is not a Floor; neither is the
  bare `tell.anecdote.channel`, which serves the *template* for inspection at
  `/floor/` but stages no pile.
* Under #92's `*.anecdote.channel` PSL wildcard submission, the registrable domain of
  `some-pile-name.tell.anecdote.channel` is the **whole hostname** — every named
  Floor automatically gets its own browser storage group. The alias rule and the
  storage-isolation story are the same shape; nothing extra to submit.

## What is served, and what it does

Three files in `floor/` are the entire origin — `index.html`, `floor.mjs`, `sw.js` —
plus a 404 for everything else. Self-contained on purpose: no mother-host stylesheet,
no third-party bytes, nothing the shared template's inspectability doesn't cover
(#92's "dumb shell" — richer capability only ever arrives iframed-in as a guest).

When the thing is working the page is one of two rooms:

* **Viewer** — the pile has questions. A pile's questions are its poll slugs (one
  `anecdote.poll/v1` object per question; there is no multi-question container).
  The Floor lists them from `polls.json` — the mother Tell's public transparency
  projection of `_data/constitutions/<pile>/*.json` — and points the iframe at
  **vanilla Tell** for whichever is selected, puppeted by query params the same way
  a QR does. Switching questions swaps the iframe src; nothing else moves.
* **Creator** — the pile has no questions. The Floor drafts the three data objects
  that make "a poll (and supporting pile)" real: the Tell-side constitution
  (`_data/constitutions/<pile>/<poll>.json`), the pile-side `anecdote.poll/v1`
  object, and the supporting pile's handshake stanza (`_data/piles.yml` shape,
  matching what data-pile's `bin/pile-new` prints). Drafts live in the name-origin's
  own localStorage. **Placing the artifacts is the owner's gesture** — a PR to the
  Tell, a commit to the pile repo. The Floor holds no credential to do it for them.

The iframe link carries **no `tok`, no `post`, no `su`** — a Floor cannot mint the
authorization HMAC (that needs `TELL_QR_SECRET`, which stays with the Tell engine)
and must never carry a transport credential. Absent a token, Tell's landing falls
through to its **preview** branch (rendered from `pile`+`poll`+`q` display params) —
the mode selection #93 calls "already free". The four-param verbatim forward for
live QRs is untouched; `test/landing.test.mjs` pins both branches.

## Custody

Same four-party split as #93, and the Floor stays the room, not a party:

* it serves no secrets and stores none — the floor-gateway Worker holds no
  credential and performs no admission;
* it never proxies the mother site under a foreign name (blank slate means blank —
  the template's files or 404);
* its service worker does the minimum unprompted job (#92's open audit, answered
  here for this origin): precache two files at install, serve them cache-first,
  same-origin GETs only. No firmware pin, no message channel, no background
  anything. The pin machinery guards origins that execute privileged ops; the Floor
  executes none. If it ever grows one, it inherits the pin — not the reverse.

## Deploy: one-time provisioning

The Floor mirrors `anecdote.channel/docs/tls-acm.md`'s wildcard-cert-plus-reconcile
pattern, owned by this repo. Three pieces, in order:

1. **TLS** — add `*.tell.anecdote.channel` to anecdote.channel's
   `config/san-list.txt` (a TLS wildcard matches exactly one label:
   `*.anecdote.channel` covers the bare `tell` host but nothing under it). The
   existing acm-sync reconcile picks it up; well within the 50-host pack cap.
2. **DNS** — one wildcard record on the `anecdote.channel` zone: `*.tell`,
   **proxied (orange-cloud)**. Proxied is required, not optional: the Worker route
   only intercepts proxied traffic, and unlike the per-node Pages onboarding there
   is no origin behind these names to grey-cloud toward — the Worker *is* the
   origin. (This is the "made-up-name-on-the-spot" DNS wildcard #92 flags as a
   bigger change for `*.anecdote.channel` generally; scoped under `tell.` it is one
   record on infrastructure this repo's Workers already assume.)
3. **Worker** — `wrangler deploy` in `workers/floor-gateway/` (route
   `*.tell.anecdote.channel/*`). It fetches the template from this repo's own Pages
   origin (`/floor/*`) and serves the same bytes on every name; the label never
   reaches content selection. The bare-host routes (feed-gateway `/piles/*`,
   submit-gateway `/submit`) are unaffected — the wildcard route does not match the
   bare host.

No GitHub Pages repo per name, no per-name DNS, no PSL prerequisite (the PSL entry
improves *storage grouping*; serving works without it).

## Deferred, on purpose

* **Reading the pile itself.** Today's question list comes from the mother Tell's
  `polls.json` (cached per-name for offline revisit). The real destination is the
  pile: the Floor as the room where the pile's own decryption/unpacking runs and
  the question shows with **decrypted answer data** found in the pile. That waits on
  reconciling two crypto worlds that don't currently meet:
  - the pile's at-rest model is **age + openssl** (X25519 age identity unwraps
    `inbox/seed.age`, then an aes-256-ctr hash ratchet; data-pile `CONTRACT.md`),
    with the identity living in `PILE_AGE_IDENTITY` — a repo-secret posture that
    could ride Action env vars, but the workflows route stays deliberately
    downplayed for now;
  - the browser world is **WebCrypto** — anecdote's `age-mint.mjs` already mints
    age identities via `crypto.subtle` X25519 and holds them Elevated (device
    trove), and `system-viewer.md` leaves "decrypt a `tell.digest/v1` manifest into
    `deliveries/`" explicitly open.
  The Floor-shaped answer, when it comes: the ratchet (sha256 + aes-ctr) is fully
  WebCrypto-expressible, the age unwrap is the hard part, and per the dumb-shell
  rule the keys and subtle work belong to an Elevated guest iframed in — not to
  Floor-served bytes.
* **The probe-line contract, if any.** Query params suffice for everything the
  Floor does today (#93 anticipated exactly this). When decrypted pile data needs
  to reach the question shown on Tell, that becomes the pile's own probe talking to
  the iframed Tell — not a Floor capability.
* **Tell-side authoring fall-through.** The landing's tokless branch renders a
  preview; growing it into anecdote's full authoring UI (per
  `docs/system-viewer.md`: "authoring a poll as a data object… is what
  tell.anecdote.channel is becoming") is Tell/anecdote work the Floor just points
  at.
* **The second hosting path.** #93 wants "a couple ways", the alternate being the
  pile's own bottle domain under `*.anecdote.channel` (#92's jar/bottle infra).
  The template is placement-agnostic already (relative SW scope, self-contained
  files), so that path is a second worker/route decision, not a template change.
