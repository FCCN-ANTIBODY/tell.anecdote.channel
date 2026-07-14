# The Floor — one page, any name, and the name is a key

Implements the hosting half of anecdote.channel#93 (with #92's wildcard-origin story
underneath it). The Floor is a template this repo builds and publishes: a blank
slate, available offline, **identical on every `<name>.tell.anecdote.channel` a user
makes up**. The server has no obligations other than delivering that one page — it
is not smart enough to be attacked, because it never learns that the name matters.

## The name is a key, not an address

Typing a made-up name is not navigation; it is minting. The browser's same-origin
rule makes every distinct hostname its own hermetic local-storage vault, so choosing
`some-pile-name.tell.anecdote.channel` carves out private, local space anchored to
that name. Nothing is provisioned — not a DNS record, not a SAN entry, not a repo,
not a registry row. Ever. That is the enshrined feature, not a compromise.

By convention (the opening exercise), the name is the slug of the user's own
**data-pile** — colloquially `anecdote://data/<name>`. A data-pile is a **private
repo**: never deployed, never served, never addressable, never mounted on any
domain. It is an API-driven object — it pulls encrypted digests down to itself,
holds the only decrypting identity, and invents questions (which are admission
filters for what the pile lets in). Because nothing is served under the name,
name collisions between users are a non-event: two strangers at the same name each
get their own browser's vault, and the network put nothing in either.

Key shape: one label deep, pile-slug charset (`^[a-z0-9][a-z0-9-]*$`, data-pile
`bin/pile-new`'s rule), ≤ 63 chars (the DNS-label bound, enforced at pile mint).
Under #92's `*.anecdote.channel` PSL wildcard, each name is additionally its own
browser *storage group* — same shape, nothing extra to submit.

## What the page does

Three constant files — `floor/index.html`, `floor.mjs`, `sw.js` — are the whole
template. Self-contained on purpose: no mother-host stylesheet, no third-party
bytes, and **no fetches at all** (the test suite greps for a network surface and
fails if one grows). The network stays out of the room.

* **The vault** — the name-origin's own localStorage holds the pile's local
  presence: its questions, as `anecdote.poll/v1` objects (one object = one
  question; a pile's questions are its poll slugs). Questions enter only by the
  owner's gesture: pasted in from cold storage / the private pile repo, or created
  right on the page. The owner can keep a hundred piles locally and open any of
  them by typing its name.
* **The switcher + iframe** — the questions in the vault populate a switcher;
  selecting one points the iframe at **vanilla Tell**, puppeted by display params
  the way a QR would be. The destination is not a choice — the page offers no way
  to aim the iframe anywhere else — and the link never carries `tok`, `post`, or
  `su` (only the Tell engine can mint an authorization; the Floor holds no
  credential of any kind). Absent a token, Tell's landing renders its **preview**
  branch (the mode selection #93 calls "already free"); the four-param verbatim
  forward for live QRs is untouched and pinned by `test/landing.test.mjs`.
* **The creator** — a question is a filter for what the pile lets in. Creating one
  writes it into the vault and shows the two objects the owner may carry onward by
  their own means: the pile-side `anecdote.poll/v1` object, and the Tell-side
  constitution (`_data/constitutions/<pile>/<poll>.json`) for whenever the
  question is registered out in the wild. The Floor pushes nothing, nowhere.
* **The service worker** — the minimum unprompted job (#92's open sw-audit,
  answered for this origin): precache the shell at install, serve it cache-first,
  same-origin GETs only. No pin, no message channel, no background anything. After
  first visit, the room is the user's, offline, regardless of the server's fate.

## Hosting: one canonical Pages site, masked by the wildcard

The Floor deploys as its **own GitHub Pages site** — a separate site output from
this repo's Jekyll build:

```
bin/floor-build [outdir]        # default outdir: _floor
```

emits the complete, ready-to-publish site: the three template files, `.nojekyll`,
and a `CNAME` carrying the one canonical hostname (default
`floor.tell.anecdote.channel`, override with `FLOOR_CNAME`). The canonical name is
itself just another name under the wildcard — calling it up directly gets the same
blank slate as any other name, because the page can't do anything else.

Every made-up `<name>.tell.anecdote.channel` is then **masked onto that one site at
the edge**: a proxied wildcard DNS record (`*.tell`), with Cloudflare routing all
of it to the single canonical Pages origin underneath. That is DNS/edge
configuration — one wildcard record, one `*.tell.anecdote.channel` line already in
anecdote.channel's `config/san-list.txt` for the edge certificate — not a repo
concern, not compute, and **never per-name**. GitHub hosts exactly one copy; the
wildcard names are masks over it.

The template also stays served at `tell.anecdote.channel/floor/` (the Jekyll build
includes `floor/` as static files) so the canonical bytes are always inspectable in
place, and the build's `cmp` test pins the deployed site byte-identical to them.

## Storage adapters — the glebe pin

Every wildcard path serves this one page; a `/storage/.<adapter>` path makes it a storage
**consumer** instead of the pile UI (`floorRole`). In that role the floor iframes the engine's own
canonical bottle (`<adapter>.bottles.anecdote.channel`), asks it to `install`, and drives the client
that bottle *delivers over the wire* — verified, mounted as a Blob URL, and dropped on reload. This
is **the glove**: the engine's code is borrowed at runtime, never vendored. What the floor *does*
vendor (`floor/adapter/`) is only its own consumer machinery — verify the signed manifest, mount +
import the entry, and the probe transport — byte-mirrored from `anecdote.channel/composer` (see
`floor/adapter/MIRROR.md`). No fetch grows: the one outward surface stays the iframe.

The trust rule is a **glebe**. A storage engine is a powerless glove with no inherent authority;
what it has is a glebe — the provisioned origin it was granted to occupy. The floor trusts a
delivered client not because of the engine but because of the **office that granted it that land**:
the apex/constellation identity that provisioned `bottles` and signs each engine's `install`. So
trust is *served-from-the-glebe* (the iframed canonical origin; if DNS/cert resolve, the land is
real — `bottle-attest`'s domain anchor) **and** *signed-by-its-office* (the pinned key).

That pin — `floor/pin.mjs` `GLEBE_KEY` — is the glebe-holder's public fingerprint, and it is
deliberately **per-apex, not per-name**: every `*.tell.anecdote.channel` floor and every
`*.bottles.anecdote.channel` engine are co-tenants of one glebe (`anecdote.channel`), so they pin
the same office. That is *why* one constant floor works — it's constant because the glebe is
constant; a different apex is a different glebe, floor, and pin. It is **not** the Tell's own key
(`keys/tell.fpr` is the delivery signer — a different office that never signs installs; pinning it
would force every Tell to re-mint every engine, breaking the shared canonical `git-enough`). Until
the operator sets it the key is `null`, the floor wires no seam, and an adapter load reaches for
nothing — the safe default, exactly like an unprovisioned bottle.

## Custody

Same four-party split as #93, and the Floor stays the room, not a party. It serves
no secrets and stores none of its own; the vault belongs to the user's browser at
the user's chosen name. There is no server data. The pile — the party with the
data and the only reading key — stays a private repo the network cannot call up.

## Deferred, on purpose

* **Decryption in the room.** The pile's at-rest model is age + openssl
  (`PILE_AGE_IDENTITY` unwraps `inbox/seed.age`, then an aes-256-ctr hash
  ratchet); the browser world is WebCrypto (anecdote's `age-mint.mjs` already
  mints X25519 identities via `crypto.subtle`, held Elevated). Reconciling the
  two — so the pile's decryption/unpacking runs observably in the room and the
  question shows with decrypted answer data — is the staging work #93 tracks.
  Per the dumb-shell rule, keys and subtle work would arrive as an Elevated
  guest, never in Floor-served bytes. (A pile repo could in principle carry
  Action env vars for secrets, but the workflows route stays downplayed.)
* **The probe-line contract, if any.** Query params suffice for everything the
  Floor does today; decrypted pile data reaching the iframed Tell would be the
  pile's own probe talking to Tell, not a Floor capability.
* **Tell-side authoring fall-through.** The landing's tokless branch renders a
  preview; growing it into anecdote's full authoring UI (per
  `docs/system-viewer.md`) is Tell/anecdote work the Floor just points at.
