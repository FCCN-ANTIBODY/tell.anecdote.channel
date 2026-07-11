#!/usr/bin/env node
// tell.anecdote.channel/bin/tenants.mjs — PER-TENANT ACCOUNTING (docs/multitenancy.md, brick 1). A tenant
// is a data-pile the Tell fronts; its branch is feed/<scope>/<id> (the pile pulls its verified blocks from
// there). This measures each tenant against a FIXED BUCKET — the bounded size/traffic allowance the
// placement policy (brick 2) will schedule over — so both the pooled and siloed models have the one
// measurement they depend on. Size is exact and nearly free (`git rev-list --disk-usage <ref>`, reachable
// object bytes); traffic is the delivered block count (the feed manifest's entries). No crypto, no keys.
//
//   bin/tenants.mjs [--dir REPO] [--budget-bytes N] [--budget-blocks N]   -> a tell.tenants/v1 report on stdout
//
// The report is the fixed-bucket shape: every tenant carries its usage and how much of its bucket it fills,
// with `over` set when it spills. Deterministic under test via TELL_TENANTS_AT.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let dir = ".", budgetBytes = 5 * 1024 * 1024, budgetBlocks = 1000;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") dir = args[++i];
  else if (args[i] === "--budget-bytes") budgetBytes = Number(args[++i]);
  else if (args[i] === "--budget-blocks") budgetBlocks = Number(args[++i]);
  else { process.stderr.write("tell: tenants: unknown arg " + args[i] + "\n"); process.exit(1); }
}

const git = (a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
const gitOk = (a) => { try { git(a); return true; } catch { return false; } };

// Minimal read of _data/piles.yml — a flat sequence of `- id:` / `  scope:` maps (the tenant registry).
function tenantsFromRegistry() {
  let text;
  try { text = readFileSync(join(dir, "_data", "piles.yml"), "utf8"); } catch { return []; }
  const out = [];
  for (const line of text.split("\n")) {
    const clean = line.replace(/#.*$/, "");
    const mId = /^\s*-\s+id:\s*"?([^"\s]+)"?/.exec(clean);
    if (mId) { out.push({ id: mId[1], scope: "" }); continue; }
    const mScope = /^\s+scope:\s*"?([^"\s]+)"?/.exec(clean);
    if (mScope && out.length) out[out.length - 1].scope = mScope[1];
  }
  return out.filter((t) => t.id);
}

const round = (n) => Math.round(n * 1000) / 1000;
// Reachable object bytes (`--objects` so trees+blobs count, not just the commit). `refs` positive, `notRefs`
// excluded. One ref → gross footprint. ref minus the others → EXCLUSIVE (what deleting just this tenant
// frees). All refs together → the POOLED union (shared history counted once — the real disk a pool uses).
const diskUsage = (refs, notRefs = []) => Number(git(["rev-list", "--disk-usage", "--objects", ...refs, ...notRefs.flatMap((r) => ["--not", r])]));

const registry = tenantsFromRegistry().map((t) => ({ ...t, ref: `refs/heads/feed/${t.scope}/${t.id}` }));
const presentRefs = registry.filter((t) => gitOk(["rev-parse", "--verify", "--quiet", t.ref])).map((t) => t.ref);

function measure(t) {
  if (!presentRefs.includes(t.ref))
    return { id: t.id, scope: t.scope, ref: t.ref, present: false, size_bytes: 0, size_excl_bytes: 0, blocks: 0, commits: 0, size_frac: 0, blocks_frac: 0, over: false };
  const size_bytes = diskUsage([t.ref]);                                 // gross reachable footprint
  const size_excl_bytes = diskUsage([t.ref], presentRefs.filter((r) => r !== t.ref));  // exclusive: freed if only this tenant is deleted
  const commits = Number(git(["rev-list", "--count", t.ref]));
  let blocks = 0;
  try { blocks = (JSON.parse(git(["show", `${t.ref}:inbox/manifest.json`])).entries || []).length; } catch { /* no manifest yet */ }
  return {
    id: t.id, scope: t.scope, ref: t.ref, present: true, size_bytes, size_excl_bytes, blocks, commits,
    size_frac: round(size_bytes / budgetBytes), blocks_frac: round(blocks / budgetBlocks),
    over: size_bytes > budgetBytes || blocks > budgetBlocks,
  };
}

const tenants = registry.map(measure);
const grossSum = tenants.reduce((a, t) => a + t.size_bytes, 0);          // naive sum: double-counts shared history
const pooled = presentRefs.length ? diskUsage(presentRefs) : 0;         // the union: shared history counted once
const totals = {
  count: tenants.length,
  present: presentRefs.length,
  size_bytes: grossSum,
  size_pooled_bytes: pooled,                                            // the real disk the pool occupies
  dedup_saved_bytes: grossSum - pooled,                                 // what content-addressed sharing buys
  blocks: tenants.reduce((a, t) => a + t.blocks, 0),
  over: tenants.filter((t) => t.over).length,
};
process.stdout.write(JSON.stringify({
  schema: "tell.tenants/v1",
  at: process.env.TELL_TENANTS_AT || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  bucket: { size_bytes: budgetBytes, blocks: budgetBlocks },
  tenants, totals,
}, null, 2) + "\n");
