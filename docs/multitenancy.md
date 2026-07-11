# Multitenancy: the Tell as control plane, branches as tenants

A Tell already manages many data-piles — it collects their responses, digests them, and publishes each
pile's encrypted feed. That *is* a multitenant system; this doc names the model so we build it on purpose
rather than by accident. The one-line claim: **a tenant is a branch, the Tell is the control plane, and
pooled↔siloed is a slider — not a fork.**

## Two isolation axes (and one is already built)

Tenancy needs isolation. We get two independent kinds, and they compose:

- **Crypto isolation — the door.** "Many doors, one tank" already exists (atlas `bin/hearsay.mjs`):
  several questions route at one kept pile, each block sealed by its own key, so mixed content in one tank
  stays sealed door-by-door. Tenants can share storage and still not read each other.
- **Namespace isolation — the branch.** Branches are already used everywhere as parallel, non-merging
  namespaces: `feed/<scope>/<id>` (a pile's owner-held tank of pulled blocks), `pile/<scope>/<id>` (its
  coarse public map on Atlas), plus `atlas/…`, `tell/…`, `request/…` for registration and peering. A
  branch gives a tenant its own **data + feed + lifecycle + access scope** on one ref.

Doors isolate *content*; branches isolate *namespace*. A tenant is a branch (or a set of them); a door is
how two tenants can even share a tank underneath.

## Pooled ↔ siloed is a slider

The two ways to lay tenants out are the two canonical multitenancy models, and git makes both cheap:

- **Pooled** — bin-pack many tenant-branches into one repo/host to fill a target size/traffic profile.
  This is "many doors, one tank" extended to branches. The free win: git is **content-addressed**, so
  tenants that share a template or common history store those objects **once** — pooling is storage-cheap
  by construction, not by effort.
- **Siloed** — bottle one client into their own repo, track how big their branches get, give them their
  own host and per-client accounting. Clean blast radius; independent to move, bill, or delete.

**The graduation path most multitenant systems don't get for free:** because a tenant-branch is just a
tree, a client who outgrows the pool is **lifted into their own repo with the King's Leap** git-enough
already implements — photocopy the branch → root commit → new repo (the same move `seize` used to stand up
an orphan branch). So pooled → siloed is *one gesture*, no migration project. Start everyone pooled;
graduate the heavy ones. That is why it is a slider, not a fork.

## The Tell is the control plane — mostly already

Structurally the Tell is already the multitenant manager: it runs per-pile **feed branches** and per-tenant
`bin/deliver` / `bin/govern` / `bin/rollup`. Multitenancy adds the layer *above* those — **accounting** and
**placement** — and neither needs new crypto:

- **Accounting.** Per-tenant size is exact and nearly free: `git rev-list --disk-usage <ref>` gives the
  reachable bytes behind a tenant-branch; delivery counts give traffic. The Tell can report per-tenant
  size/traffic without touching a key. This is the measurement both pooled and siloed depend on.
- **Placement.** The new decision: given a new pile's expected profile, drop it into the pooled repo with
  the right headroom, or silo it. Build the policy on what's already here — the **placement-ledger**
  concept (civic-node #94) and the **fixed-bucket** governance discipline (an action operates on a bounded
  bucket, never an unbounded queue). Placement is fixed-bucket scheduling with a graduation escape hatch.

## What this model does *not* decide (open, on purpose)

- **Serving many branches.** A static host publishes one ref at a time, so N pooled tenants means N
  deploys, a build that flattens them, or `git worktree`. git-enough builds any number of branches
  in-memory fine; the friction is strictly downstream at the host. This is the real cost of pooling and it
  stays a deployment concern, deliberately outside this model.
- **The placement policy itself** (how headroom and traffic profiles are scored) — a separate design once
  the accounting brick exists.
- **Cross-tenant limits** (repo-size ceilings, a noisy neighbor's traffic) — fixed-bucket bounds the write
  side; the read/serve side is the host's problem above.

## Two models for what a branch *is*

The section above treats a branch as a tenant's private **namespace** — isolation between tenants, often
from a clean state. There is a second, complementary model where the branch is a **versioned read-cursor**
into an *already-used* source, and it is where this pattern earns its keep for aggregation.

- **Clean-state tenancy (namespace).** Each tenant branches from empty; the branch isolates one tenant's
  data + feed + lifecycle. This is the pooled/siloed model above.
- **Live-source cursors (revision).** A data-pile has already accumulated real blocks. A consumer branches
  it (or branches a branch) not for isolation but because it cares about **the state at that revision** —
  the commit it branched. The branch point *is* the "as-of" handle. Leased copies and snapshots live here.

### Report cursors: asynchronous, verifiable, non-blocking

Give each report backend ("research account") its own branch off a live source and the whole aggregation
tier decouples:

- **The report attests to the source hash.** A backend that branches at `sha:X` emits *"computed over
  source at X,"* signed. Anyone re-runs against X and verifies; no report is authoritative over another —
  verify-from-anyone applied to *analysis*, on the existing content-addressing + attestation spine. This is
  the "democratic reports" property: many independent, individually-checkable claims pinned to a revision.
- **Append-only ⇒ fast-forward only ⇒ no rebase.** A data-pile never rewrites; a backend just **advances
  its cursor along one lineage**, `X → Y`. The delta `X..Y` is exactly the new blocks to fold in, so a slow
  backend catches up **incrementally** at its own pace. History rewrite (rebase) never enters the picture.
- **Readers vs writers is why nothing bogs down.** The feed branch is owner-append-only; report branches
  are **read cursors that emit their derived artifacts elsewhere**, never writing back to the source. Zero
  write contention by construction — the slowest algorithm you own can grind for hours against its snapshot
  and block **nothing**. State this as a rule: a report branch reads a pinned revision and writes only its
  own output.
- **This is consumer-groups over an append-only log — git-native and signed.** Each backend is an
  independent consumer tracking its own offset (the branch point) over the pile's block log, fanning out and
  advancing when ready — the event-sourcing pattern, except every offset is a verifiable content hash and
  every output a signed attestation.

### Tags vs branches, and who hosts it

- **A tag (or a bare commit hash) is a frozen lease** — an "as-of X" snapshot that never moves; right for a
  leased copy you hand out. **A branch is a moving cursor** — right for a backend that keeps up. Different
  lifetimes, no conflict: tags/hashes for leases and snapshots, branches for report accounts.
- **Antidote is the natural host.** Aggregation moved off Atlas to Antidote, so Antidote becomes the
  *report/aggregation control plane* — research accounts attached to the branches of an existing data-pile —
  complementary to the Tell as the *pile/tenant control plane*. Same model, one tier over.

## The bricks, in order

1. **Per-tenant accounting** on the Tell — size (`rev-list --disk-usage`) and traffic per tenant-branch,
   reported in the fixed-bucket shape. The first real brick; both modes need it.
2. **Placement** over that accounting — pooled bin-pack vs silo, writing to the placement ledger.
3. **Graduation** — wire the King's Leap lift as the pooled→siloed operation (the tooling already exists;
   this makes it a named tenant action).
4. **Report cursors** (Antidote) — attach a research account to a source branch, attest each report to its
   branched source hash, fast-forward the cursor to fold `X..Y` incrementally. The async aggregation tier.
