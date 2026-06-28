# Signed self-contained QR provenance

A QR carries **two separable credentials**, and only one is built today.

- **Token (authorization).** `tok = HMAC(k_pile, "tok:pile:poll:round")` — a *symmetric* HMAC the
  minting Tell, and only the minting Tell, can verify (it holds `TELL_QR_SECRET`). It authorizes a
  reply into **the mailbox this Tell tracks**: a reply posted as a GitHub Issue — or, in the scalable
  shape (`OPEN-QUESTIONS.md` §F), a comment on the poll's **canonical Issue** — which
  `bin/collect-submissions` ingests. This is built, and keeps its job unchanged.
- **Signature (provenance + integrity).** *Unbuilt.* A signature over **the exact payload** — *this
  version of the question, this share link* — proving both *who* issued it and that *this exact
  content* is intact. It is the gate that decides whether a poll or share is **worth processing at
  all**, before anything is spent on it.

The token answers *"may this reply enter my mailbox?"* The signature answers *"is this share worth
processing, and did it come from someone I trust?"* Different questions, different verifiers, different
points in the flow — both ride in the one QR.

## Why provenance, and why now

The token dies off-node: a peer holding a shared QR cannot verify an HMAC without the secret. But the
whole point of the QR is to travel — peer-to-peer, air-gapped, with custom payloads and **no registry
on the far side**, scaled by tiling many into a matrix (the QR is the floppy disk). A recipient in that
world has exactly one cheap thing to go on: *is this signed, by someone I recognize, over content that
hasn't been altered?* If not, discard it without processing. That gate is the signature.

It also closes the old §J gap from the other side. "What the respondent was shown is unverifiable" is
resolved not by binding the shown fields to a Tell-side registry (retired), but by the submission
carrying the poll's **signature**: the Tell confirms the reply is to a *version of the question a
trusted signer actually issued* before processing it.

## What gets signed

Not the raw QR URL — param order and re-encoding are not stable, so signer and verifier would compute
different bytes. Instead a **canonical preimage**: the payload fields in a fixed serialization (sorted
keys, explicit encoding), e.g. a sorted newline-joined `key=value` block or canonical-JSON. The
signature covers the whole payload **including `tok`**, binding "this content, with this token, from
this signer" as one unit. The `tok` is already public in the QR, so signing over it leaks nothing.

A distinct signing **namespace** (e.g. `tell-poll`) separates this from delivery's `-n data-pile`
signatures, so a manifest signature can never be replayed as a poll signature or vice versa.

## Signature scheme vs. size

Delivery uses `ssh-keygen -Y sign` (armored `BEGIN SSH SIGNATURE` blob, verified against
`keys/tell.signers`). The **key** is the reuse seam; the **armoring** is not — the armored blob is
large for a QR. The underlying key is Ed25519, whose raw signature is **64 bytes** (~88 base64 chars):
compact enough to ride a single QR beside the existing params. So: same signer key the Tell already
publishes, a compact raw-signature encoding for the QR, armored SSH kept for delivery. (Producing a
raw signature over an arbitrary preimage needs a small signer step rather than `ssh-keygen -Y sign`,
which only emits armored — an implementation detail for the build slice.)

## Trust roots without a registry

The QR asserts *which* signer it claims (a short signer id / fingerprint). That names the origin; it
does not confer trust — anyone can sign their own payload. Trust is the recipient's: an
**accepted-signers set** they hold locally (reuse the `keys/tell.signers` / `allowed_signers` idiom).
The worth-processing gate is therefore two-part: (1) the signature verifies against the asserted key,
and (2) that key is in the recipient's accepted set (or, for open intake, it verifies and the signer is
recorded for a later trust decision).

For the local node verifying its own QRs, the accepted set is its own key — trivial. For a **foreign**
QR, that set is a **local friend list**, built out of band by a signed handshake the node merges by hand
— the same shape the peer tier already uses (`_data/atlases.yml`, where a listed peer "may truthfully
trigger this node's matcher", pinned by its `signer` fingerprint). There is no *global* registry of whom
to trust; each node curates its own. The signature proves *who*; the friend list decides *whether to
act*.

### Authority: a verified friend triggers, it does not transfer

The load-bearing rule (now stated in the workspace `VISION.md`): **a verified friend's payload is a
trigger, never imported truth.** A foreign signed QR — or a peer's bill — does not hand the node data to
believe; it hands it a *reason to search its own*. On a passing signature the node runs **its own**
search over **its own** data and answers from what it authoritatively holds, importing nothing foreign.
This is exactly the "one matcher, two triggers" shape the Atlas peering design (`OPEN-QUESTIONS.md` §D)
already specs — internal search and a peer's request are one matcher, two callers. Trust roots and the
bill are the same idea at two tiers.

So the trust decision and the data authority are *always* local. **Cross-node discovery** — how friend
lists get seeded and advertised (the `/polls.json` transparency seam is a natural surface: a made-public
"here is who I am / what I sign" a recipient can pull and pin) — is the genuinely open part, but it only
ever *proposes* a friend. The local merge disposes; authority never leaves the node.

Open within this: is the QR-signer friend set the **same** as the peer-Atlas list (`_data/atlases.yml`),
or a separate list? (i.e. "whose polls I will process" vs "which Atlases may trigger my matcher".)

## Where it is checked in the flow

- **Submission path (today's mailbox).** The submission block carries the poll's `sig` (and signer id)
  alongside the existing fields. `bin/collect-submissions` / `bin/authz` verify it as a pre-process
  gate: an unsigned or wrong-signer reply is dropped before govern spends anything. `tok` still does
  its mailbox-authorization job unchanged.
- **Share / matrix ingest (future).** A heavier shared payload is verified whole on arrival; the
  signature is the first filter before any processing of custom data.

## Size budget and the matrix

A single signed poll fits one QR (current params + ~88 chars of signature + a short signer id).
Heavier custom payloads exceed one code and **tile into a matrix**: the packet format becomes
chunk-aware — a payload id, `index/total`, and a **whole-payload signature over the reassembled
bytes** (not per-chunk, so a partial scan can't be processed as if whole). The full tiling format is
its own later thread; this note only fixes that the signature is over the *complete* payload.

## Slice plan

1. **Canonical preimage + sign in `bin/qr`** *(done)* — `tl_qr_canon` defines the deterministic
   serialization (payload params, `sig`/`kid` excluded, sorted by key); `bin/qr --signkey` (or
   `TELL_SIGNER_KEY`) emits `sig` (+ signer id `kid`) beside `tok`, via `ssh-keygen -Y sign` under the
   `tell-poll` namespace. Additive — an unsigned QR still mints. Verified end-to-end in `test/run.sh`.
2. **Verify as a worth-processing gate** *(done)* — the landing carries the exact signed query as
   `qr` in the submission; `bin/authz` verifies its signature against the accepted-signers set
   (`TELL_SIGNERS`, default `keys/tell.signers`; principal `tell`, namespace `tell-poll`) and binds it
   to the submission by its token. Default verify-if-present; `TELL_REQUIRE_SIG=1` rejects unsigned.
   The token still gates mailbox acceptance; this gates whether the poll is worth processing.
3. **Friend-list trust + local authority** — generalize the single accepted signer to a per-node
   friend list (verify the QR's `kid` against multiple accepted signers), and on a pass **trigger
   local-authoritative work** rather than ingesting the payload (the trigger-not-truth rule above).
   Trust is established out of band (signed handshake); cross-node discovery (seeding/advertising the
   list) is the open, separable part and never touches authority.
4. **Matrix packet format** — chunk-aware tiling with a whole-payload signature. Its own thread.

## Open sub-questions

- **Cross-node discovery** — how friend lists get seeded and advertised (the `/polls.json` seam). The
  trust *model* is settled (local friend list; trigger-not-truth); discovery is the open *mechanism*,
  and it only proposes — authority stays local. Includes: one friend set or two (QR-signers vs peer
  Atlases)?
- **Raw-signature tooling** — emitting/verifying a compact Ed25519 signature over a preimage with the
  same key delivery signs with (vs. carrying the larger armored SSH blob).
- **Submission carries the whole signed payload** (decided in slice 2: the reply echoes the exact `qr`
  verbatim so the Tell recomputes the preimage). Open only if Issue-body size becomes a real constraint.
- **Revocation** — retiring a compromised signer from accepted sets, registry-less.
