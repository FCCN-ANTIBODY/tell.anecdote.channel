# The per-poll registry

A poll has three kinds of data, with three different trust and write models. Today they are
scattered, and that scattering touches several open questions at once (`OPEN-QUESTIONS.md`
§J, §F, §K). This note is the consolidating design.

The load-bearing decision: **the respondent-facing poll is self-contained in its QR and is
intentionally unbacked.** The QR carries everything a respondent is shown, and there is *no
registry in the respondent path*. A Tell still keeps a **judge-side** registry — the per-poll
constitution it governs by — but that is a separate thing the respondent never reads. What ties
a shared poll to its origin is **not** a registry lookup; it is a **signature** over the QR
(provenance). That distinction is the spine of everything below.

Why unbacked: these QRs are meant to be shared peer-to-peer, air-gapped, with custom payloads
and *no registry at all* on the receiving side — optical "floppy disks," scaled by tiling many
into a matrix. A registry-backed poll cannot survive that trip; a signed, self-describing one
can.

## The three layers

| Layer | What | Who writes | Reviewed? | Lives |
|---|---|---|---|---|
| **1 — Judge-side config** | question, type, options, guidance, lifecycle | operator / `bin/poll` | yes — committed, PR-as-consent | `_data/constitutions/<pile>/<poll>.json` |
| **2 — The QR** | the self-contained poll payload + provenance signature + authorization | `bin/qr` (minted) | no — it is a signed bearer packet | the QR itself |
| **3 — State** | dedup ledger, tally, round status | the ingest job | no — never hand-edited | `state/<pile>/<poll>.json` *(unbuilt)* |

Layer 1 is the Tell's *own* governance, read only by the judge (`bin/govern`). Layer 2 is what
travels. Layer 3 is machine-written runtime state, kept strictly out of the reviewed config.
Layer 1 and Layer 2 are deliberately **not** the same source — a foreign QR shared into a node
with no Layer 1 at all must still be answerable and verifiable.

## Layer 1 — judge-side, and published only for transparency

The per-poll **constitution** is the delegated rule `bin/govern` applies before sealing. It
moved from `constitutions/` to **`_data/constitutions/<pile>/<poll>.json`** so the build can
render it; `bin/govern`'s default path and the `ingress` action's `constitutions-dir` moved
with it.

The build renders a public projection to **`/polls.json`** (the same Liquid-over-`site.data`
idiom as `/piles.json`): each governed poll's renderable subset plus its `lifecycle` block.
This is a **transparency** artifact — *which polls this Tell governs, by what rule* — and the
natural seam for a later made-public list used in **cross-node discovery**. It is explicitly
**not** consumed by the respondent path; the landing renders from the QR.

A poll's `lifecycle` block:

```json
"lifecycle": { "round": 1, "opens_at": "…", "closes_at": "…", "one_per": "respondent" }
```

Note the direction of travel: per `OPEN-QUESTIONS.md` §F, `round`/`exp` ultimately want to ride
**inside the signed QR** (so an air-gapped recipient can honor a poll's window with no registry),
not be looked up Tell-side. The constitution copy is the judge-side mirror, useful for govern and
for the transparency list; the QR copy is authoritative for the respondent.

## Layer 2 — the QR carries content *and* provenance

Today the QR carries the poll's render hints (`q`, `opts`, `guidance`) plus a **symmetric HMAC**
token (`tok = HMAC(k_pile, …)`). The HMAC is an *authorization* — only the minting Tell, holding
`TELL_QR_SECRET`, can verify it. That is the right tool for "authorize a reply into *my* mailbox,"
and it is useless to anyone else by design.

It is the wrong tool for **provenance**. Proving *where a poll came from* to a registry-less
recipient needs an **asymmetric signature** — exactly the model `bin/deliver` already uses for
manifests (`ssh-keygen -Y sign`, verified against `keys/tell.signers`). Giving the QR that same
signature is its own thread (see §J resolution below and the slice plan); it is what makes a
shared, unbacked, custom-payload QR trustworthy off-node.

Authorization (HMAC, mailbox-scoped) and provenance (signature, anyone-verifiable) are
**separable roles** — a QR may carry one, the other, or both.

## How this closes the open questions

- **§J — shown vs. judged.** *Resolved by provenance, not by binding to a registry.* The poll
  stays unbacked and self-contained in the QR; its integrity comes from a **signature** proving
  origin, not from reconciling shown fields against a Tell-side constitution. (The earlier
  registry-fetch idea is retired.)
- **§J — no authoring path.** `bin/poll` (unbuilt) writes the judge-side config *and* mints the
  signed QR from one input.
- **§F — QR expiry.** `exp`/`round` ride inside the signed token preimage; `bin/authz` honors a
  per-poll window, retiring the coarse global `TELL_ALLOWED_ROUND`.
- **§F — one reply per respondent.** The Layer-3 ledger stores the dedup key; `bin/authz`'s
  dedup seam checks/records against it. (Stores a handle; does not mint one — identity is still
  the open §F question.)
- **§K — the shared window.** The pile's `bin/ingest` reads a poll's `closes_at` to know a round
  is sealed; `deliver` flips the round's state. The window is honored, not two unrelated cron
  offsets.

## Slice plan

1. **Relocate + transparency publish** *(done)* — constitutions under `_data/`; `bin/govern`
   and the `ingress` action repoint; `/polls.json` served as a transparency list; `lifecycle`
   seeded. No respondent-path change.
2. **QR provenance signing** — the asymmetric signature over the QR payload, reusing the
   SSH-signer infra; the design tensions (what is signed, the size budget vs. QR capacity and
   the matrix tiling, how a registry-less recipient learns which signers to trust) get their own
   sketch first.
3. **`lifecycle` in the signed QR** — `exp`/`round` in the token preimage; `bin/authz` honors it;
   `TELL_ALLOWED_ROUND` retired.
4. **State ledger + dedup** — `state/<pile>/<poll>.json`; one-reply-per-respondent.
5. **`bin/poll` authoring** — one gesture writes the config and mints the signed QR.

## Open sub-questions

- **Identity for dedup** — the ledger stores a handle; it does not source one. Coupled to §F's
  "who authenticates the POST." This design unblocks *storage*, not *identity*.
- **Trust roots without a registry** — a recipient verifying a foreign QR's signature needs to
  know *which* signers to trust. With no registry on their side, where does that trust set come
  from? This is the heart of slice 2 and of cross-node discovery.
- **Size budget** — a signature is ~100+ bytes against a small QR; heavier custom payloads push
  past one code, which is what the "matrix of QRs" is for. The packet format must be tiling-aware.
- **Tally privacy** — Layer 3 must never publish per-respondent counts (coarse only — echoes §C).
