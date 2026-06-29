# How a Tell declares its boundary file(s) — planning (raw captured thinking)

> Status: **raw idea capture**, not a spec. This continues the boundary thread captured in
> [`notes/reporting-locus-rethink.md`](reporting-locus-rethink.md) (the merged label-authority
> model, the boundary-as-address floor, contested-by-construction, the bisect stack). That note
> settled *what* a boundary is and *why*; this note works only the narrow mechanical question it
> leaves open: **how does a Tell, in this repo, declare the boundary it speaks for — when there
> can be more than one?** Nothing here is decided or built.

## The question, scoped

`tell.yml` today declares this Tell's public face with a **single `scope` scalar**
(`scope: colorado`) — a namespace string, not a shape. `bin/register` reads that scalar, signs an
entry, and PRs it into an Atlas's `_data/tells.yml`. There is **no geometry anywhere in the Tell
yet.** The merged model says the geometry is the whole point ("**boundaries are the definition,
not a detail**… has a submitted boundary *is* the test for a physical-world concern"), so the
gap to close is: where does the polygon live, how does `tell.yml` point at it, and how does the
registration gesture carry it — for **one or many** boundaries.

The constraint that drives every choice below: **a Tell can speak for more than one boundary.**
The reporting-locus note already establishes why this is the normal case, not the exotic one —
"you belong to many **overlapping, non-nested** constituencies at once," and a single hub may
front piles for a city *and* a watershed *and* a school catchment. So the declaration is a
**list from day one**, never a scalar that we pluralize later.

## The atom we're declaring (inherited, not re-litigated)

From the merged model, one kind of thing only:

> an **attested boundary** = **polygon + `basis[]`**. "Official" is a provenance *tag* on an
> attestation — informative, never load-bearing.

So a Tell's declaration is not "here is the truth about Fort Collins." It is "**here is a shape I
assert, and here is what my assertion is made of.**" Authority is emergent at the Atlas/edge from
*convergence among many* such assertions (the recorded invariant: no single attester confers
authority). The Tell's job is only to **emit a well-formed, signed claim** and stand behind it
with its key. That keeps this note purely about declaration plumbing and out of the
authority-ranking question, which lives at the pool/edge by design.

## Proposal: a `boundaries/` directory + a `boundaries:` list in `tell.yml`

Mirror the two patterns the repo already trusts — **`keys/`** (published public material, the
fingerprint read *live* and never copied) and **`reports/`** (a glob of published artifacts the
Atlas consumes).

### 1. The files: `boundaries/<slug>.geojson`

Each boundary is its own file under `boundaries/`. One file = one polygon (or MultiPolygon) =
one referent. Plain GeoJSON, because it is the lowest-friction thing a government GIS export, a
QGIS hand-draw, or a `geojson.io` sketch all already emit — "anyone can draw a polygon" only
holds if the format is the one everyone already has.

Geometry goes in the file; **provenance/meta does not** (it lives in `tell.yml`, below). Keeping
the `.geojson` a *pure shape* means it round-trips through any mapping tool untouched and the meta
stays human-diffable in one place. (Open: GeoJSON `Feature.properties` *could* hold the meta
instead, making each file self-contained for an Atlas that just slurps files — see open threads.)

### 2. The declaration: a list, each entry a claim

`tell.yml` grows a `boundaries:` block. Sketch — **illustrative, field names not settled**:

```yaml
# tell.yml — alongside id / name / url / scope / reports
boundaries:
  - slug: fort-collins            # stable per-boundary id; also the file stem
    concept: municipality          # what KIND of referent (city, watershed, catchment…)
    label: "Fort Collins, CO"      # human-readable, shown in a directory
    file: boundaries/fort-collins.geojson
    basis:                         # what this assertion is MADE OF (the merged-model basis[])
      - kind: official-import       # provenance tag — informative, never load-bearing
        source: "City of Fort Collins GIS, 2024 parcel export"
    provenance: official           # the tag, called out; default would be `asserted`
  - slug: cache-la-poudre
    concept: watershed
    label: "Cache la Poudre watershed"
    file: boundaries/cache-la-poudre.geojson
    basis:
      - kind: asserted
        source: "hand-drawn from USGS HUC-10, for what it's worth"
```

Why this shape:

- **List-first.** More than one is the default case; the schema never has a singular form to
  outgrow. A Tell that speaks for exactly one boundary writes a one-element list.
- **`basis[]` is mandatory, even if empty-ish.** The honest default the voucher already takes
  (`bin/vouch` records a self-asserted claim "measured at 0 with an empty basis") applies here:
  a bare hand-drawn shape declares `kind: asserted` and earns no weight — *declared*, not
  *believed*. This is the same "factorize and tag, don't block or pass" stance as ingress
  vouching, one tier up: the Tell **asserts a shape and says what it's made of**; the Atlas/edge
  decides weight.
- **`concept` is the decoupling hook.** The reporting-locus note splits **geometry** (the shape)
  from **constitution** (the rule), and warns the two were being conflated. `concept` tags the
  *kind* of geometry so siblings (same referent, slightly different shapes) and unrelated
  concepts (city vs. watershed) are both legible. It is **not** the qualification rule — that
  still lives per-poll in `_data/constitutions/<pile>/<poll>.json`. Address here; Qualification
  there; the file boundary between the two repos *is* the architectural enforcement of the split.

### 3. `scope` stays; it is the namespace, not the shape

`scope` keeps doing its current job: the `<scope>` segment of the `tell/<scope>/<id>` registration
branch and the Atlas-side namespace. It is a coarse *label*; `boundaries[]` is the *geometry*. They
are different layers and should not be collapsed (collapsing them is exactly the geometry/scope
confusion the merged model warns about). A reasonable convention: `scope` names the broadest
namespace the Tell sits in (`colorado`), while `boundaries[]` enumerates the actual shapes it
asserts within (or across) it. Open whether a multi-boundary Tell whose shapes straddle scopes
needs anything richer than one scalar (see threads).

## Signing — reuse the ownership proof, anchor the bytes

The registration gesture already carries a proof: `bin/register` signs the commit with
`TELL_SIGNER_KEY` and anchors it via the `signer` fingerprint published at `keys/tell.fpr`
(read *live*, never copied, so the published signer and the registered anchor cannot drift). Two
ways the boundary bytes ride that existing proof — **pick one, both avoid new crypto**:

- **(a) Implicit — covered by the signed commit.** The boundary files are in the repo the signed
  registration commit references; signing the entry that names them transitively vouches for them.
  Cheapest; weakness is there's no compact per-file digest to pin or to detect drift after the
  fact.
- **(b) Explicit — a content hash per boundary in `tell.yml`.** Each entry carries
  `sha256: <hash-of-the-geojson>`, so the declaration commits to exact bytes (mirror of how
  `keys/tell.fpr` is the compact anchor for the signer). An Atlas — or anyone — can fetch the file
  and verify it matches what the Tell signed, and an **amendment** to a boundary is a visible hash
  change, not a silent edit. (b) makes "the same key that signs digests stands behind these shapes"
  checkable without trusting the transport, the same property the digest feed already has; (a) avoids
  carrying and maintaining a digest at all.

Either way the principle holds: **a Tell's boundary claim is only as strong as the key behind it**,
and that's the delivery-signer key, so a boundary inherits the Tell's identity for free. A lone
signer still only *asserts* — authorization stays emergent at the pool (the invariant is untouched).

## How registration carries it — and the Atlas side it implies

`bin/register entry` today emits `{id, name, url, scope, signer, reports}`. The boundary work adds
the geometry channel. Two shapes, again pick one:

- **Inline:** fold a `boundaries:` block into the `_data/tells.yml` entry. Simple, but bloats the
  Tell directory with geometry meta and couples every directory reader to it.
- **Referenced:** the entry gains a single `boundaries:` *pointer* (a URL/glob on
  the Tell's own surface, e.g. `boundaries/*.geojson`, exactly as `reports` is a glob the Tell
  hosts and the Atlas pulls). The Atlas reads the pointer and pulls the actual shapes into its own
  **district directory** — a new `_data/districts.yml` (the directory of districts the merged model
  describes: "label + submitted boundary polygon + attestations of authority"), which does **not
  exist on the Atlas yet** (today it has `tells.yml`, `piles.yml`, `needs.yml`, no districts file).
  This keeps `tells.yml` about *Tells* and puts *shapes* in a directory built for them, and matches
  "**boundaries are public claims and only memberships are private**" — the Atlas can serve the whole
  shape directory openly because a polygon leaks nothing.

This also honors **discoverability backoff** from the reporting-locus note: *declaring* a boundary
in `tell.yml` does **not** make a Tell public. The shape reaches a public Atlas directory **only
when the Tell registers** (`bin/register pr`). A private Tell with boundaries stays private; the
spam fix (a zillion counter-shapes don't get into a *reputable* Atlas directory → they fall below
premium labeling) lands at the Atlas, exactly where it should.

## What this deliberately does **not** decide

Per the merged model, all of this is **declaration only**. It does not rank competing shapes, pick
a default among siblings, or compute a canonical map — those are **edge/lens** concerns
(area-overlap convergence, the bisect stack, the consent ladder), and pushing any of them into the
Tell's declaration would smuggle a privileged attester back into the center. The Tell emits a
signed claim; the world weighs it.

## Open threads (let simmer)

- **Meta in YAML vs. in the GeoJSON `properties`.** A self-contained `Feature` (geometry + basis in
  `properties`) lets an Atlas slurp a directory of files with no sidecar, at the cost of meta that no
  longer diffs in one place. The split sketched above (shape in file, meta in `tell.yml`) keeps the
  meta human-diffable but needs the sidecar. Held open.
- **Format & size.** GeoJSON is universal but verbose; a county polygon can be MBs. TopoJSON /
  simplification / a coarse-vs-fine pair (a cheap outline for display, full detail for device-side
  point-in-polygon) may be needed. The device bisects locally, so fidelity matters there, not just
  for display. Don't optimize until a real polygon hurts — but name it now.
- **Per-file digest (signing option b) — adopt or not**, and if so, where the hash list lives
  (inline per entry vs. a `keys/`-style manifest like `tell.signers`).
- **`scope` vs. multi-boundary reality.** Is one scalar enough when a Tell's shapes straddle
  namespaces? One reading keeps scope = branch namespace and boundaries = geometry; whether that
  holds against the `tell/<scope>/<id>` branch grammar is open.
- **Boundary versioning / amendment.** Append-only vs. in-place edit of a `.geojson`; how an Atlas
  notices and how convergence treats a moved line (the merged model wants disagreement to stay
  *visible* — a silent overwrite would erase it).
- **Atlas `_data/districts.yml` schema.** This note assumes one will exist; its exact shape, and how
  it reconciles many Tells' overlapping claims into the "federated/amalgamated list across Atlases,
  weighted by attestation," is the Atlas's question to answer (cross-refs civic-node OPEN-QUESTIONS
  on registration idiom unification).
- **`concept` vocabulary.** Free-text vs. a small controlled set (municipality / county / watershed
  / catchment / …). Controlled aids the bisect stack's "vertical list of concepts"; free-text avoids
  a central taxonomy authority. Tension with "no privileged attester" — a fixed vocabulary is itself
  a soft-power center.

---

# Live capture (session 2) — the user story, and "a pinned boundary is an anecdote"

> Working note left **to notice when advantageous**, not to act on now. This is the design
> conversation thinking-out-loud, recorded so the shape is here when we attack design +
> implementation. Faithful to the framing offered, including the deliberate non-decisions.

## The user story we'll attack this with

> *I start a Tell server that I know I want to be about a **politically bounded object**. I'm the
> kind of driven person who would supply a **map file of my own preparation** — and even though it's
> GeoJSON, it may be **wholly prepared by me**, not handed down by some official authority. I'm
> welcome to **sign where it came from** (how that signing works, we'll discuss another time). I just
> want to provide a boundary I **know I want to talk about** — and maybe I'll host **more** boundaries
> that **I endorse**. That might be the right **pausing place**: I'm not sure I need a single slot to
> be "the official topic."*

What this story pins down for the declaration design:

- **Self-prepared is the *normal* origin, not the fallback.** The driven operator hand-draws the
  shape; an official import is just one `basis[]` flavor among others. This is the merged model's
  "government gets a Tell like anyone else and supplies its boundary *for what it's worth*" — but read
  from the *author's* chair: the format must make a hand-drawn shape a **first-class, sign-able**
  thing, never a second-class "unofficial" one.
- **Provenance signing is wanted but deferred.** The operator *wants* to sign "where it came from";
  we explicitly **table the mechanism** (it rhymes with the `keys/tell.fpr` ownership proof and the
  optional per-file digest above — but don't force it now).
- **Everything is fabricated, so we declare, we don't adjudicate.** "We see these objects as
  **fabricated in every scenario**, so there needs to be **agreement eventually — but we're not going
  to get there** [here]." This is the strongest statement yet of declaration-only: the Tell asserts a
  shape it wants to talk about; convergence/agreement is someone else's later job, and we don't block
  on it.
- **Endorse-many is in scope; a designated primary is the open pause.** Hosting "more boundaries that
  I endorse" confirms the **list-first** call. Whether one entry is flagged as **the** topic
  (a single "official topic" slot) vs. a **flat endorsed set** is left open *on purpose* — see the
  pause below.

## The realization: a pinned boundary is just an *anecdote* the server holds up

> Refined in **session 3** below: the Tell does not only *pin* a prior utterance — it **mints** its
> founding anecdotes (the boundary among them). Read "pin" here as the weaker case of "mint."

The format of the boundary a Tell "holds up as its opinion" (and which is presumably **tolerable to
the people inside** that Tell) is **basically identical to what any member could just *say* as their
own opinion.** So the server isn't declaring a truth — **it is pinning an opinion.** That collapses
two things we were modeling separately:

- **What gets routed *into* a Tell** = an **anecdote** — possibly **signed by an Atlas you know**, or
  **arrived spontaneously** (someone let their contact info out on purpose), or a **response to a
  private poll**.
- **What a Tell *pins*** = **one of these anecdotes, in pure form.**

So the boundary-declaration schema may not be its own thing at all: **a declared boundary is an
anecdote whose content is a shape, that the server has chosen to pin.** Declaration = the server
endorsing one anecdote out of the same class any constituent could utter. This is a satisfying
unification — *Address, Qualification, Participation* and now the **anecdote** as the single quantum
that flows, gets pinned, and gets weighed — but it has **reach well past this note**, so flag it:

- **Next thing to design: the anecdote schema itself.** "What schema is an anecdote sent to a Tell
  server?" is now the upstream question; boundary-declaration becomes a *profile* of it (an anecdote
  carrying a polygon + `basis[]`). Worth its own note before we freeze any `tell.yml` `boundaries:`
  shape, so the two don't drift.
- **The voucher precedent likely *is* the anecdote envelope** (`tell.voucher/v1`: a claim + `basis[]`
  + confidence). If a routed response, a pinned boundary, and a member opinion are all the same
  envelope, the schema work is mostly *naming the union*, not inventing one.

## The pause: do I need a single "official topic" slot?

Recorded as an **open, deliberately-unresolved** fork (the operator "isn't sure"):

- **Flat endorsed set:** every boundary is a peer the server endorses; no anointed primary —
  resonates with "no privileged attester," and with the consent ladder's *endorse vs. consent vs.
  refrain* (the server's list is its **endorsements**).
- **Single primary slot:** one boundary is "what this Tell is *about*." Cleaner for a directory card
  and for "this Tell speaks for Fort Collins"; re-introduces a privileged-claim shape and asks the
  operator to make a choice they may not want to.
- **A middle option exists:** a flat set plus a *soft, non-structural* `primary:` hint — neither a
  hard slot nor strictly flat.

## "First to say it" — cosmic-fringe credit (let simmer, mostly for the delight of it)

For all that we **refuse leaderboards and authority-attribution**, it would be *funny and good* to
know **who was first to say a thing** — and to finally credit people who'd otherwise never get any.
Especially a word/claim that **only ever reached you via solicited Atlas servers** — "who you heard
chatting about it" — because that path is **uncontrollable**: it's a cosmic-fringe accident of routing
that no one can plan or game. That very un-gameability is what makes the credit *safe* (it can't
become a power move) and *charming* (it honors the unhonored). Keep it **orthogonal to weight/authority**
— first-utterance is a *story about provenance*, never a multiplier on a claim's standing. A natural
home: an optional, append-only "first heard via …" trace on an anecdote, surfaced as flavor, never as
rank.

## Added to open threads

- **Author the anecdote schema first** (boundary = a profile of it); decide whether `tell.voucher/v1`
  is already the envelope. This intersects the "meta in YAML vs. GeoJSON `properties`" thread above —
  if the meta is just anecdote fields, the two forks resolve together.
- **Single "official topic" slot vs. flat endorsed set vs. flat-plus-soft-`primary:`-hint.**
- **"First to say it" provenance trace** — opt-in, un-gameable, orthogonal to weight; design the
  Atlas-routed "who you heard it from" path so credit is possible without ever becoming rank.
- **Provenance signing of a self-prepared shape** — wanted, deferred; reconcile with the
  ownership-proof / per-file-digest options when we pick the signing story.

---

# Live capture (session 3) — the Tell *mints* its founding anecdotes; the Atlas recursion

> Continues the trail. Refines session 2's framing and opens one new fork, held with the operator's
> own reasoning attached. Still nothing decided.

## From *pin* to *mint*

The sharper version of the session-2 realization: the boundary (and the Tell's other opening claims)
is less a **pinned** anecdote that some member said first, and more **the first anecdotes the Tell
server itself mints.** The Tell is the **originator** of its founding anecdotes, not only the curator
of a prior utterance. So "declare a boundary" = the Tell **mints a founding anecdote whose content is
a shape** — same envelope as any anecdote, the distinguishing facts being *who minted it* and *that it
was first for this node*. (The "first to say it" credit below still applies; minting just names the
more important actor — the node standing up its own opening claim.)

## The Atlas might mint too — and that opens a negotiation

An **Atlas could do the same** — mint its own founding anecdotes. But an Atlas minting introduces a
**negotiation a Tell needs in order to disagree**, and the crux is **what kind of thing the Atlas
mints**:

- **Constitutional** — the minted thing *binds*, the way an Atlas's constitution already binds the
  Tells it lists (they must report in the shape it requires). To disagree is to fall **outside** the
  constitution — expensive.
- **Just anecdotes they offer** — the Atlas mints *offers*, not law. A Tell can take them, leave them,
  or counter them like any anecdote.

**Recorded reasoning (the operator's):** disagreeing **anecdotes** are *easier to resolve* than
constitutional disagreement. Tell servers can **say whatever they want within the Atlas's
constitution** — exactly as a Tell lets members say whatever the **Tell's** constitution allows, with
**overlap** doing the reconciling. So the cheap-to-resolve path is: **the constitution sets the outer
bound; minted anecdotes (the Atlas's and the Tells') are speech within it; overlap/competition
resolves their disagreement — never constitutional fiat.**

## The fractal this exposes

Same shape, one tier up — worth naming because it keeps the whole stack consistent:

- A **Tell** mints anecdotes; **members** say whatever the **Tell's** constitution allows; overlap
  reconciles.
- An **Atlas** mints anecdotes; **Tells** say whatever the **Atlas's** constitution allows; overlap
  reconciles.

Constitution = the boundary of permissible speech at each tier; minted anecdotes = speech inside it;
overlap = the resolver. This is the geometry-vs-constitution decoupling read as a *speech* relation:
the constitution gates qualification, the minted anecdotes are address-layer claims, and disagreement
among addresses is handled by overlap, not by promoting one address to law.

## Added to open threads

- **Mint vs. pin.** The founding boundary is **minted** by the Tell (it originates), refining session
  2's "pinned." Confirm the anecdote envelope can carry a *minter* + *first-for-this-node* fact,
  distinct from the "first to say it" provenance trace.
- **Does an Atlas mint — and if so, as constitution or as offered anecdotes?** Held with the operator's
  reasoning attached: the *offered-anecdotes* path keeps disagreement cheap (resolved by overlap within
  the Atlas's constitution); the *constitutional* path is the heavier alternative. Not yet decided.

---

# Live capture (session 4) — what a jurisdiction node *shows*: the page is the real-time democracy

> Continues the trail. This is the **view layer** falling out of mint + the phantom shape — what a
> person actually sees at a political-jurisdiction node (a DNS-addressed page, civic-node up to a
> state). Likely an Atlas/Apex concern more than a Tell one, recorded here for continuity; may move.

## The page *is* the aggregate, because no one owns the jurisdiction

We already hold that **no civic-node or workspace is authoritative and *owns* a jurisdiction** — so
whatever a jurisdiction node shows is **necessarily the aggregation the public Atlas provides** (the
recorded "give up the view-from-nowhere — every aggregate is lens-relative" decision, now read as a
*rendering* fact, not just a data one).

Minting closes the loop and makes the **state level** legible the same way as a neighborhood:

- **Tells mint opinions** (their founding anecdotes — boundaries and the rest).
- The **Atlas holds the phantom shape** that *contains* those Tells — and that phantom shape, owned by
  no one and emergent from convergence, **is "your state."** The state was never a thing that speaks;
  it is the **shape the speaking Tells fall inside.**
- Therefore the **state's page should literally be the real-time democracy of what those Tells are
  saying** — the live aggregate of the anecdotes minted within the phantom boundary, not a report
  *about* the state from some owner of it.

So a jurisdiction node, at any tier, renders the same thing: **the minted anecdotes addressed to the
territory its boundary names, shown live.** "State" is just the largest phantom shape we've drawn so
far; the render rule doesn't change with size.

## The hard constraint: elevate **without** an algorithm telling us what's trending

The load-bearing open worry, stated as a **firm no**: we do **not** want an opaque **trending
algorithm** deciding what rises. How a page **elevates / orders / surfaces** what it shows is unsolved
— and must stay un-solved by ranking-function.

This is the *same* problem the **"Defusing the default"** section already wrestles with; its disciplines
are the raw material here (and they deliberately avoid a ranking function):

- credibility shown **as data** (a meter / attestation count / overlap %), never used to **anoint** a
  default;
- **perturb** position, don't **curve** it (list + occasional **on-device** order reversal — curving is
  itself editorial);
- **tier**, don't flatten (premium claims share the shuffled top; jokes/opt-in stay below the fold);
- **no unmarked norm** (every claim marked by attester + attributes — never "official/normal/default").

And the edge/lens machinery (the **bisect stack**, the **consent ladder**) is where ordering becomes the
*user's* assembly rather than the page's verdict. The open design question is whether those disciplines
are **enough** to render a satisfying "real-time democracy" view, or whether some non-algorithmic
elevation primitive is still missing — but the constraint is fixed: **convergence shown as data, never a
trending oracle.**

## Added to open threads

- **Jurisdiction-node view = live aggregate of minted anecdotes within the phantom (convergent)
  boundary.** Same render rule at every tier (neighborhood → state). Its home is probably the
  Atlas/Apex render, respecting the existing **neutral-geometry vs. edge-curation** split (the live
  aggregate is geometry/substrate; elevation is curation = edge). Cross-ref the DNS angle
  (`state-name.anecdote.channel` handing out a jurisdiction's view) and civic-node as the bootstrap.
- **Elevation without a trending algorithm** — hard constraint (no opaque ranker). Draw on the
  defusing-the-default disciplines + the bisect-stack/consent-ladder edge; open whether they suffice or
  a missing non-algorithmic primitive is needed. Do **not** resolve this with a ranking function.
