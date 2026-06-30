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

## Registering with an Atlas

[Atlas](https://atlas.anecdote.channel) is the **directory** that makes a Tell discoverable. A pile is
not discoverable on its own — it has no address without a Tell to receive for it — so what an Atlas lists
and addresses is a **whole Tell node**, and piles group up behind it. Registering with an Atlas is the
same PR-as-consent gesture a pile makes with a Tell, one tier up — and the **cleanest** form of that
gesture lives here, in `bin/register` (the data-pile carries the descendent forms; see
[`OPEN-QUESTIONS.md` → "B. Registration"](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md#b-registration-validation-and-idiom-unification)).

**The registration signs this Tell's ownership of its own instance.** `bin/register` opens a PR that
appends this Tell's entry to the Atlas's `_data/tells.yml`, on a branch named **`tell/<scope>/<id>`**
(its identity read from `tell.yml`). The branch **name** carries the claim — *which* Tell, in *what*
scope, is asking to be listed; the commit is **signed with `TELL_SIGNER_KEY`** (the very key that signs
digest manifests, fingerprint published at `keys/tell.fpr`), which is the **proof**; and the entry's
`signer` field records that fingerprint as the **open anchor**. So an Atlas — and anyone reading its
registry — can confirm the Tell that registered is the Tell that signs the digests it delivers.

```sh
bin/register entry     # this Tell's _data/tells.yml entry (id, name, url, scope, signer, reports)
bin/register branch    # the ownership-signing branch: tell/<scope>/<id>
bin/register pr        # open the signed PR to an Atlas  (the register-atlas.yml workflow runs this)
```

`register-atlas.yml` dogfoods the reusable **`register` composite action**
(`.github/actions/register`), which any jurisdiction drops into its own Tell to list itself on an Atlas:
the action reads *its* `tell.yml` + `keys/tell.fpr` from the calling repo's workspace and signs with
*its* `TELL_SIGNER_KEY` — never the template's (the same code-vs-data split the `deliver` action makes).
It uses `ATLAS_PR_TOKEN` (Contents+PR write on the Atlas) to open the PR; without it, `bin/register`
prints the entry to paste by hand.

**This reach across repos is the consent gesture, not a privilege.** Registration is the handshake of a
consent-driven discovery network: a Tell *offers* itself, an Atlas *accepts* by merging, and the piles
behind a Tell keep the right to *leave* — to take their mailbox to another Tell if they dislike the
Atlas this one keeps company with (a pile registers by PR and is revocable by leaving; the pile is the
principal). Unlike a decision made over your head that can compel you to move a physical home, here
consent is present in **every** outcome — including the ones in conflict. So the only token this gesture
needs is write on the **Atlas**, to *offer*; it asks for **no** write access to this Tell, and none over
any pile.

Discoverability is not free. To be listed is to accept — and an Atlas guarantees in return (see
[`atlas.anecdote.channel/CONSTITUTION.md`](https://github.com/FCCN-ANTIBODY/atlas.anecdote.channel/blob/main/CONSTITUTION.md)):

- **Addressability.** A listed Tell is reachable at the stable `url` it registered and answers for the
  piles it fronts.
- **Reporting in a described shape.** An Atlas **aggregates** — it rolls the Tells it lists into
  constituency/jurisdiction reports — so it needs their reports uniform. The chain is constitutional:
  **Tell's `CONSTITUTION` describes its transparency reports** (the `reports/govern-…` it already
  publishes; the entry's `reports` field points at them), and an **Atlas's `CONSTITUTION` requires**
  those descriptions to be present and to take the form it aggregates.
- **Affirmative escalation, and an open line.** The Atlas this constellation builds for escalates
  *affirmatively* — every report rolls into **all** the constituency aggregations it belongs to — and
  keeps an **open line** to every constituency instead of a strictness gate: a report gains weight and
  credibility as it accumulates. (An Atlas that promises no aggregation is simply a different Atlas
  constitution, and not this model.)

So Tell's transparency reports are not only an audit surface for the pile — they are the raw material an
Atlas aggregates upward. Keep them well-described (`CONSTITUTION.md` → "I describe the transparency
reports I publish").

**Reporting direction (specified — see [`docs/reporting.md`](docs/reporting.md)).** A standalone Tell
publishes **no** public report. Its *one compulsory artifact* is its **Atlas-facing delivery**, produced
**only when it joins an Atlas** — de-identified, membership-tagged rows and their signed summaries (a
`tell.poll.summary/v1`: `count`, coarse option tallies, verdict counts, the poll's topic; never answer
text or `asker`). That summary is **promoted into the signed manifest head** (exactly as the coarse
`tell.voucher.summary/v1` is, below), so it is **recomputable from the public manifests without
decrypting** and the **pile backs it** via `bin/prove`. The crucial relocation: the **public aggregate
and its small-N suppression live at the Atlas (the pool)**, where N is large across many Tells — never at
each Tell, where N=2 either blanks or re-identifies. The per-answer **govern log is re-homed, not
demoted**: sealed in the block (system of record), disclosed **one record at a time on a justified
query** (an evidence locker — the identity tie is the Issue author), never a bulk public surface. Atlas
roll-up (`OPEN-QUESTIONS.md` §C) is the consumer of those signed summaries.

## Ingress: QR → authorized Issue → digest

> A reply may now also arrive as a **comment on a canonical poll issue** (`bin/open-poll`), carrying the
> constituent's revocable **nonce**, a **run** id, and the full signed **anecdote** — the Tell half of
> anecdote.channel's egress. See [`docs/issue-ingress.md`](docs/issue-ingress.md). The HMAC gate below is
> unchanged.

A reply enters through Tell's **mailbox** — its GitHub Issues — and is gated by an HMAC capability the
Tell-runner mints:

- **A pile hosts many polls.** A QR addresses a specific **poll** on a pile — unrelated polls (an open
  question, an unsolicited broadcast, a sensor-checked dropbox) can share one pile and route by `poll`.
  The QR also carries the originating **asker** and the poll **type** as routing metadata.
- **Authorization (HMAC), bound to {pile, poll, round}.** One master secret `TELL_QR_SECRET` (set by
  `bin/tell-bootstrap`) derives a per-pile key `k_pile = HMAC(TELL_QR_SECRET, "qr:"||id)`, never
  stored. A QR for pile `id` / poll `poll` at `round` embeds `tok = HMAC(k_pile, "tok:"||id||":"||poll||":"||round)`.
  Only the secret can *mint* one, and a token minted for one (pile, poll, round) does **not** verify
  as any other — so a QR can't be retargeted to a different poll. `type` and `asker` ride along
  **unbound** (carried to the pile for routing, not pinned). The token is the authority: a valid
  token *is* the authorization, so Tell keeps **no poll/asker registry**. Bump `round` to rotate a QR.
- **QR build.** `bin/qr --pile ID --poll POLL [--round R] [--type T] [--asker A] [--question Q] [--opts CSV]`
  (run by the `qr.yml` workflow with the secret) prints the landing URL
  `…/?pile&poll&round&tok&type&asker&q&opts`. This is "the runtime generates what future QR builds use."
- **Submission.** `index.md` reads that config and builds a **pre-filled `issues/new` link**; the
  respondent's click posts an Issue whose body carries a fenced ```tell``` JSON block
  `{schema:"tell.submission/v1", pile, poll, round, type, asker, shown_guidance, tok, answer}`. The
  page only builds a link — nothing phones home. `shown_guidance` is the guidance the respondent was
  *shown* — informational provenance, carried to the pile. What *governs* is the constitution the pile
  delegated to Tell (`_data/constitutions/<pile>/<poll>.json`), applied below before sealing.
- **The ejected check.** `bin/authz` reads the submission JSON on stdin (overridable via
  `TELL_AUTHZ_CMD`, mirroring the rollup seam), re-derives `k_pile`, recomputes the HMAC over
  {pile, poll, round}, constant-time compares, and confirms the pile is one Tell fronts. Stricter,
  type/asker-aware rules (rate, dedup, geo, one-reply, sensor checks) plug in here.
- **Ingest loop.** The whole loop is the `ingress` composite action (`.github/actions/ingress`),
  wired up by the thin `ingest-submissions.yml` template (manual dispatch by default; cron/issues are
  commented suggestions an adopter edits). In order: `bin/collect-submissions` reads open Issues, runs
  `bin/authz`, and **stages** only the authorized ones (tagged with poll/type/asker/shown_guidance);
  `bin/govern` then judges each staged answer against the pile's delegated constitution and **attaches**
  the verdict in place (pre-seal, on plaintext — no key); the bundled `deliver` action's `bin/rollup`
  emits a `tell.digest/v1` block whose records carry each answer's `poll`/`type`/`asker`/`shown_guidance`
  **and its `governed` verdict** so the pile routes already-judged signals, and seals it; then
  `bin/finalize-submissions` closes each Issue — `ingested` meaning *authorized and delivered* (not
  "kept"), `rejected` (with reason) for the unauthorized. Tell writes only its own repo.
- **Authorize always; govern only when delegated, and never withhold.** Tell always decides what is
  *authorized and delivered*. It *judges* only the polls a pile delegated to it
  (`_data/constitutions/<pile>/<poll>.json`), and even then it only **attaches** a verdict before sealing — it
  never drops or edits an authorized answer. Whether a reply is ultimately *kept* remains the
  **data-pile's** call: it receives every authorized record already carrying its `governed` verdict and
  the `constitution_sha`, and may re-judge at its boundary. A pile that delegates nothing gets its
  answers sealed `held` (unjudged). Curating a few sound constitutions in one open place lets one
  operator serve many piles; the authority is the pile's, lent and revocable.
- **Exposure, named.** A raw answer is world-readable in its Issue between posting and sealing, so
  this channel is for **coarse, consented answers, not secrets** (see CONSTITUTION.md).
- **Transitional by intent.** This public-Issue mailbox is how replies enter *today* (Phase 0). The
  direction is to judge before anything is public and seal at pickup, replacing it with a
  **direct-transfer** collector — a windowed, agent-batched submission — so unmoderated plaintext never
  waits in the open. The `bin/authz` "rate, dedup, geo, …" seam is where that pre-public judging lands.
  See [`ROADMAP.md`](ROADMAP.md).

## The rollup seam (what each block carries)

What a block *contains* is isolated to one pluggable hook: the deliver pipeline runs `bin/rollup <id>
[scope]` (or `$TELL_ROLLUP_CMD`) once per window and seals its stdout as that window's block. Empty
output means "nothing new this window" and the pile is skipped. The default `bin/rollup` emits the
**authorized submissions `bin/collect-submissions` staged** for the pile — each block is the window's
batch of accepted answers, stamped with the Issue number that carried each (a literal ingress→egress
custody record). Everything downstream — encrypt, chain, sign, publish — is fixed production code.

## Vouching: factorize and tag, don't block or pass

When Tell introduces a record it **attests to what it can measure** about it — not that a respondent is
truthful, but **how strongly the record's own claims are real**. A reply that says it is in-jurisdiction
but offers only "uploaded photo" as backing made a claim no one can vouch for; Tell's job is to make that
*assessable*, not to dictate what is good enough. So Tell never silently blocks or passes on this basis:
it **factorizes what it knows with what it has, attaches the measurement, and lets policy decide weight**
(the same stance as the delegated verdict — `CONSTITUTION.md`: "I attach, I do not withhold").

- **Factorize (ingress).** `bin/govern` runs `bin/vouch` (or `$TELL_VOUCH_CMD`) per record, pre-seal,
  and attaches a **`tell.voucher/v1`** — `{ location:{gradient,value,confidence}, source:{kind,confidence},
  basis:[…] }`. `gradient` is the coarse→fine tier (`country|state|county|neighborhood`); `kind` is
  `asserted|upload|sensor`; `confidence ∈ 0…1`. The default is deliberately **honest, not faked**: with
  only the self-asserted submission fields it records the claim and measures it at **0** with an empty
  `basis`. A real signal (IP-coarse geo, EXIF, an attested sensor) plugs into the same seam and raises
  confidence — "the runtime generates what later builds use." This is where Phase-1 **geolocation
  adherence** lands ([`OPEN-QUESTIONS.md` → "F. Tell"](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md#f-tell-public-mailbox-to-pre-public-pickup)):
  the gate is the *measurement*, applied by policy.
- **Seal the full voucher; project a coarse one.** The **full** voucher (including any exact location
  `value`) travels **sealed inside the encrypted block** — owner/pile only, identity stays out of the
  core. `bin/rollup` also emits a **`tell.voucher.summary/v1`** for the block — gradient *histograms* and
  confidence *ranges*, **never a value** — and `bin/deliver` promotes that summary into the **clear
  manifest entry** (`entries[].vouch`), where `head.sig` covers it (the digest hashes the whole entries
  array). So the coarse measurement is **signed and attestable wherever the bytes are served** — raw
  GitHub, the gateway Worker, or a future edge.
- **Tag at the edge, optionally police.** The kept feed-gateway Worker reads that signed summary off the
  head and stamps **`X-Tell-Vouch`** (a convenience projection a static cache rule could also set). A
  *strict* Tell **may** turn it into a gate (404 an unvouched pickup); the default **serves-and-tags**.
  The voucher is signed data in the artifact — the edge enforces a policy expressed there, it is never
  the source of truth, so this capability is architectural and not tied to any one host.

## What Tell guarantees a pile

Each delivery on `feed/<scope>/<id>` MUST: `age`-encrypt every block to the pile's registered
`age_recipient`; hash every block into the signed `manifest.json` chain with a `ratchet_pub`
commitment; sign the manifest head with the key whose fingerprint the pile pinned; and stay reachable
at `/piles/<id>/feed/*`. The pile's `bin/verify` rejects anything else and fails closed. The coarse
`entries[].vouch` summary (when present) rides **inside** that signed head, so it is covered by the same
signature the pile already checks — no new verification surface, and unknown to a pile that ignores it.
