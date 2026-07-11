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

## The bricks, in order

1. **Per-tenant accounting** on the Tell — size (`rev-list --disk-usage`) and traffic per tenant-branch,
   reported in the fixed-bucket shape. The first real brick; both modes need it.
2. **Placement** over that accounting — pooled bin-pack vs silo, writing to the placement ledger.
3. **Graduation** — wire the King's Leap lift as the pooled→siloed operation (the tooling already exists;
   this makes it a named tenant action).
