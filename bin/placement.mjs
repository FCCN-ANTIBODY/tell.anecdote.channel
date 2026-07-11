#!/usr/bin/env node
// tell.anecdote.channel/bin/placement.mjs — PLACEMENT (docs/multitenancy.md, brick 2). Pure policy over the
// per-tenant accounting (brick 1, bin/tenants.mjs): decide, for each tenant, POOLED (bin-packed with others
// into a shared repo up to a fixed bucket) or SILOED (its own repo). This is fixed-bucket scheduling with a
// graduation escape hatch — a tenant too big to share, or already spilling its bucket, is siloed; the rest
// are packed first-fit-decreasing. No git, no crypto: it reads a tell.tenants/v1 report and emits a plan.
//
//   bin/tenants.mjs --dir REPO | bin/placement.mjs [--pool-bytes N] [--pool-blocks N] [--silo-frac F]
//
// The plan (tell.placement/v1) is the placement-ledger content (civic-node #94): pools with their fill and
// headroom, silos with their reason, and a flat placement per tenant. Deterministic under TELL_PLACEMENT_AT.
import { readFileSync } from "node:fs";

let poolBytes = 5 * 1024 * 1024, poolBlocks = 1000, siloFrac = 0.5;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pool-bytes") poolBytes = Number(args[++i]);
  else if (args[i] === "--pool-blocks") poolBlocks = Number(args[++i]);
  else if (args[i] === "--silo-frac") siloFrac = Number(args[++i]);
  else { process.stderr.write("tell: placement: unknown arg " + args[i] + "\n"); process.exit(1); }
}

let report;
try { report = JSON.parse(readFileSync(0, "utf8")); } catch { process.stderr.write("tell: placement: need a tell.tenants/v1 report on stdin\n"); process.exit(1); }
if (report.schema !== "tell.tenants/v1") { process.stderr.write("tell: placement: stdin is not a tell.tenants/v1 report\n"); process.exit(1); }

const present = report.tenants.filter((t) => t.present);
const siloCapBytes = siloFrac * poolBytes, siloCapBlocks = siloFrac * poolBlocks;

// A tenant is siloed if it is too big to share a pool efficiently (its footprint exceeds the silo cap) or
// it is already over its own bucket (it outgrew pooling). Everything else is a pooling candidate.
const silos = [], candidates = [];
for (const t of present) {
  const reason = t.over ? "over its bucket (outgrew pooling)"
    : t.size_bytes > siloCapBytes ? `size ${t.size_bytes}B > silo cap ${Math.round(siloCapBytes)}B`
    : t.blocks > siloCapBlocks ? `blocks ${t.blocks} > silo cap ${siloCapBlocks}`
    : null;
  if (reason) silos.push({ id: t.id, scope: t.scope, reason, size_bytes: t.size_bytes, blocks: t.blocks });
  else candidates.push(t);
}

// First-fit-decreasing bin-pack the rest: biggest first into the first pool with headroom, else a new pool.
candidates.sort((a, b) => b.size_bytes - a.size_bytes || b.blocks - a.blocks);
const pools = [];
for (const t of candidates) {
  let pool = pools.find((p) => p.size_bytes + t.size_bytes <= poolBytes && p.blocks + t.blocks <= poolBlocks);
  if (!pool) { pool = { pool: `pool-${pools.length}`, tenants: [], size_bytes: 0, blocks: 0 }; pools.push(pool); }
  pool.tenants.push(t.id); pool.size_bytes += t.size_bytes; pool.blocks += t.blocks;
}
for (const p of pools) { p.headroom_bytes = poolBytes - p.size_bytes; p.headroom_blocks = poolBlocks - p.blocks; }

// Flat per-tenant placement (the ledger's row-per-tenant view).
const poolOf = {};
for (const p of pools) for (const id of p.tenants) poolOf[id] = p.pool;
const placements = [
  ...candidates.map((t) => ({ id: t.id, scope: t.scope, placement: "pooled", pool: poolOf[t.id], reason: "fits a shared bucket" })),
  ...silos.map((s) => ({ id: s.id, scope: s.scope, placement: "siloed", reason: s.reason })),
].sort((a, b) => a.id.localeCompare(b.id));

process.stdout.write(JSON.stringify({
  schema: "tell.placement/v1",
  at: process.env.TELL_PLACEMENT_AT || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  policy: { pool_bytes: poolBytes, pool_blocks: poolBlocks, silo_frac: siloFrac },
  pools, silos, placements,
  totals: { tenants: present.length, pooled: candidates.length, siloed: silos.length, pools: pools.length },
}, null, 2) + "\n");
