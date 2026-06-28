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
QR, *where the accepted set comes from* is the crux of this whole thread, and the most likely place it
reconnects to **cross-node discovery** (the `/polls.json` transparency seam): a made-public list of
who-signs-what that a recipient can pull and pin out of band.

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
3. **Accepted-signers config** — local trust set (the `keys/tell.signers` idiom), and the foreign-QR
   trust-root question handed to cross-node discovery.
4. **Matrix packet format** — chunk-aware tiling with a whole-payload signature. Its own thread.

## Open sub-questions

- **Trust roots for foreign QRs** — the heart of it; ties to cross-node discovery.
- **Raw-signature tooling** — emitting/verifying a compact Ed25519 signature over a preimage with the
  same key delivery signs with (vs. carrying the larger armored SSH blob).
- **Does the submission echo the whole signed payload or just `sig`?** Enough must reach the Tell to
  recompute the preimage and verify, without bloating the Issue body.
- **Revocation** — retiring a compromised signer from accepted sets, registry-less.
