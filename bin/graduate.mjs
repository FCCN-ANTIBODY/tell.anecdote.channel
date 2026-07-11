#!/usr/bin/env node
// tell.anecdote.channel/bin/graduate.mjs — GRADUATION (docs/multitenancy.md, brick 3). The pooled→siloed
// lift: take a tenant's feed/<scope>/<id> branch out of a shared repo and stand it up as its OWN repo with
// a FRESH lineage — the King's Leap (photocopy the tree → root commit, no shared history). The result is
// host-agnostic: a plain git repo ready to push to any host. Content is preserved exactly (the new root
// commit's tree hash equals the source branch's tree); only the lineage is new, so the graduated tenant is
// now independently sovereign. Real git today (the Tell runs in a git context); git-enough is the on-device
// swap later, same as the other bins.
//
//   bin/graduate.mjs --dir SRC --out OUTBASE --id ID --scope SCOPE     lift one tenant
//   bin/graduate.mjs --dir SRC --out OUTBASE --from-plan               lift every `siloed` tenant in a
//                                                                      tell.placement/v1 plan read on stdin
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let src = ".", out = "", id = "", scope = "", fromPlan = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") src = args[++i];
  else if (args[i] === "--out") out = args[++i];
  else if (args[i] === "--id") id = args[++i];
  else if (args[i] === "--scope") scope = args[++i];
  else if (args[i] === "--from-plan") fromPlan = true;
  else { process.stderr.write("tell: graduate: unknown arg " + args[i] + "\n"); process.exit(1); }
}
const die = (m) => { process.stderr.write("tell: graduate: " + m + "\n"); process.exit(1); };
if (!out) die("--out OUTBASE is required");

const git = (dir, a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

// The King's Leap: materialize a branch's tree as a fresh root commit in a new repo. Returns the proof
// (source tree == new tree, and the new repo shares no commit with the source).
function lift(scopeV, idV) {
  const ref = `refs/heads/feed/${scopeV}/${idV}`;
  try { git(src, ["rev-parse", "--verify", "--quiet", ref]); } catch { die(`no such tenant branch ${ref} in ${src}`); }
  const dst = join(out, idV);
  mkdirSync(dst, { recursive: true });
  git(dst, ["init", "-q", "-b", "main"]);
  // photocopy the tree: git archive the branch, extract into the new repo (preserves names + modes).
  const tar = execFileSync("git", ["-C", src, "archive", "--format=tar", ref], { maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", dst], { input: tar });
  git(dst, ["add", "-A"]);
  execFileSync("git", ["-C", dst, "-c", "user.name=graduate", "-c", "user.email=graduate@tell",
    "commit", "-q", "-m", `graduate: ${idV} lifted from the pool (King's Leap, fresh lineage)`]);
  const srcTree = git(src, ["rev-parse", `${ref}^{tree}`]);
  const newTree = git(dst, ["rev-parse", "main^{tree}"]);
  const root = git(dst, ["rev-parse", "main"]);
  const commits = Number(git(dst, ["rev-list", "--count", "main"]));
  return { id: idV, scope: scopeV, dir: dst, root, source_tree: srcTree, tree: newTree,
    content_identical: srcTree === newTree, fresh_lineage: commits === 1 };
}

let targets;
if (fromPlan) {
  let plan; try { plan = JSON.parse(readFileSync(0, "utf8")); } catch { die("--from-plan needs a tell.placement/v1 plan on stdin"); }
  if (plan.schema !== "tell.placement/v1") die("stdin is not a tell.placement/v1 plan");
  targets = plan.placements.filter((p) => p.placement === "siloed").map((p) => ({ scope: p.scope, id: p.id }));
} else {
  if (!id || !scope) die("--id and --scope are required (or use --from-plan)");
  targets = [{ scope, id }];
}

const lifted = targets.map((t) => lift(t.scope, t.id));
for (const l of lifted) {
  if (!l.content_identical) die(`lift of ${l.id} changed content (tree mismatch) — refusing`);
  if (!l.fresh_lineage) die(`lift of ${l.id} is not a fresh root commit — refusing`);
  process.stderr.write(`tell: graduated ${l.id} -> ${l.dir} (root ${l.root.slice(0, 12)}, tree preserved, fresh lineage; ready to push to any host)\n`);
}
process.stdout.write(JSON.stringify({ schema: "tell.graduation/v1",
  at: process.env.TELL_GRADUATE_AT || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  lifted }, null, 2) + "\n");
