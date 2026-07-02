// Unit: the boundary declaration mechanics — authoring geojson + tell.yml entry compiles to a SIGNED
// anecdote.boundary/v1 artifact, pins are guarded, and renewal is the lease heartbeat (same key, fresh
// date, never a new key). Where a sibling anecdote.channel checkout exists, the compiled artifact is
// verified by the REAL client (composer/bisect.mjs) — producer and consumer agree or this fails.
// Run: node test/boundaries.test.mjs
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, defaultHash, verifyAttested, geojsonToPolygons, readBoundariesBlock, buildArtifact, declaredCenter, compileAll, checkAll, renewAll } from "../bin/boundaries.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const te = new TextEncoder();

// a scratch Tell: its own tell.yml, shapes, and (via env) its own signer key
function scratchTell() {
  const dir = mkdtempSync(path.join(tmpdir(), "tell-bounds-"));
  mkdirSync(path.join(dir, "boundaries"), { recursive: true });
  mkdirSync(path.join(dir, "keys"), { recursive: true });
  writeFileSync(path.join(dir, "boundaries/square.geojson"), JSON.stringify({
    type: "Feature", properties: {},
    geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  }));
  writeFileSync(path.join(dir, "boundaries/isles.geojson"), JSON.stringify(
    { type: "MultiPolygon", coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2]]], [[[8, 8], [10, 8], [10, 10], [8, 10]]]] }));
  writeFileSync(path.join(dir, "tell.yml"), `id: t\nscope: s\nboundaries:\n` +
    `  - slug: square\n    concept: municipality\n    label: "The Square"\n    file: boundaries/square.geojson\n    hard: true\n` +
    `    basis:\n      - kind: asserted\n        source: "hand-drawn"\n` +
    `    derives:\n      source: "the older square"\n      hash: null\n      note: "we did something to it on purpose"\n` +
    `    hash: PENDING\n` +
    `  - slug: isles\n    concept: watershed\n    label: "Twin Isles"\n    file: boundaries/isles.geojson\n    hash: PENDING\n`);
  process.env.TELL_BOUNDARY_KEY = path.join(dir, "keys/test-signer.pk8");
  return dir;
}

// 1. the YAML block reader gets the shapes it needs (list, nesting, relations, comments, quotes).
{
  const entries = readBoundariesBlock(readFileSync(path.join(ROOT, "tell.yml"), "utf8"));
  ok(entries.length >= 1 && entries[0].slug === "colorado-4", "reads the real tell.yml boundaries block");
  ok(entries[0].derives && /on purpose/.test(entries[0].derives.note), "the derives relation survives parsing (hash: null and all)");
  ok(entries[0].hard === false && Array.isArray(entries[0].basis) && entries[0].basis[0].kind === "derived", "hard flag + basis[] parse");
}

// 2. geojson → polygons: closure dropped, holes kept, MultiPolygon shaped.
{
  const p = geojsonToPolygons({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] });
  ok(p.length === 1 && p[0][0].length === 4, "a closed Polygon ring drops its repeated point");
  const holed = geojsonToPolygons({ type: "Polygon", coordinates: [[[0, 0], [9, 0], [9, 9], [0, 9]], [[3, 3], [6, 3], [6, 6], [3, 6]]] });
  ok(holed[0].length === 2, "holes ride as additional rings");
  let threw = false; try { geojsonToPolygons({ type: "Point", coordinates: [1, 1] }); } catch { threw = true; }
  ok(threw, "non-areal geometry refused");
}

// 3. compile → signed artifacts; check passes after pinning; drift is CAUGHT.
{
  const dir = scratchTell();
  const { signer, boundaries } = await compileAll(dir);
  ok(boundaries.length === 2 && signer.fingerprint.startsWith("key:sha256:"), "compiles every declared boundary under one signer");
  const square = JSON.parse(readFileSync(path.join(dir, "boundaries/compiled/square.json"), "utf8"));
  ok((await verifyAttested(square)).ok, "the compiled artifact verifies (vendored core)");
  ok(square.hard === true && square.derives.note === "we did something to it on purpose", "hard + derives are SIGNED INTO the artifact");
  // pin, then check goes green
  let yml = readFileSync(path.join(dir, "tell.yml"), "utf8");
  for (const b of boundaries) yml = yml.replace(/hash: PENDING/, `hash: "${b.id}"`);
  writeFileSync(path.join(dir, "tell.yml"), yml);
  ok((await checkAll(dir)).length === 0, "check: pins match, signatures verify, authoring and compiled agree");
  // drift the authoring shape → check catches it
  const gj = JSON.parse(readFileSync(path.join(dir, "boundaries/square.geojson"), "utf8"));
  gj.geometry.coordinates[0][1] = [11, 0];
  writeFileSync(path.join(dir, "boundaries/square.geojson"), JSON.stringify(gj));
  const problems = await checkAll(dir);
  ok(problems.some((p) => /drifted/.test(p)), "check CATCHES authoring drift from the compiled artifact");
}

// 4. renewal: the lease heartbeat — same key, fresh date, cites the exact boundary id; never mints a key.
{
  const dir = scratchTell();
  const { signer, boundaries } = await compileAll(dir);
  const renewals = await renewAll(dir, { now: "2026-07-02T20:00:00.000Z" });
  ok(renewals.length === 2, "every claim renews");
  const r = JSON.parse(readFileSync(renewals[0].rpath, "utf8"));
  const rv = await verifyAttested(r);
  ok(rv.ok && rv.by === signer.fingerprint, "the renewal verifies and is signed by the SAME key as the claim");
  ok(r.schema === "anecdote.boundary-renewal/v1" && r.boundary === boundaries.find((b) => b.slug === r.slug).id,
     "the renewal cites the exact boundary content id — the lease is over the artifact, not the name");
  // a missing key must never silently mint a new signer for renewal
  process.env.TELL_BOUNDARY_KEY = path.join(dir, "keys/nonexistent.pk8");
  let threw = false; try { await renewAll(dir); } catch { threw = true; }
  ok(threw, "renewal REFUSES to run without the original key (no silent signer swap)");
}

// 4b. the DECLARED anchor: an inline [lon, lat] parses, is validated, and is SIGNED into the artifact — but
// only when declared (its absence is honest silence). The atlas dump tests this point to observe `anchored`.
{
  const dummyGj = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  // parses out of the inline-array YAML value, all the way through readBoundariesBlock
  const parsed = readBoundariesBlock(`boundaries:\n  - slug: c\n    file: x\n    center: [-103.5, 39.5]\n    hash: X\n`);
  ok(Array.isArray(parsed[0].center) && parsed[0].center[0] === -103.5 && parsed[0].center[1] === 39.5, "an inline `center: [lon, lat]` parses to a real two-number array");
  // signed into the artifact when present
  const withAnchor = buildArtifact({ slug: "c", center: [-103.5, 39.5] }, dummyGj);
  ok(Array.isArray(withAnchor.center) && withAnchor.center.length === 2, "buildArtifact emits `center` when the anchor is declared");
  // absent when NOT declared — no key at all, so the atlas observes anchored: null (honest silence)
  const noAnchor = buildArtifact({ slug: "c" }, dummyGj);
  ok(!("center" in noAnchor), "no `center` key when undeclared — the artifact is byte-identical to the pre-anchor shape");
  ok(declaredCenter({ slug: "c" }) === undefined, "declaredCenter is undefined for an undeclared anchor");
  // a malformed anchor is REFUSED at build time, never silently dropped or coerced
  let threw = 0;
  for (const bad of [[-103.5], [-103.5, 39.5, 1], ["a", "b"], [NaN, 2], "somewhere"])
    try { declaredCenter({ slug: "c", center: bad }); } catch { threw++; }
  ok(threw === 5, "a malformed anchor (wrong arity, non-number, NaN, non-array) is refused, not coerced");
  // and the REAL committed colorado-4 now ships its anchor, inside its own shape
  const committed = JSON.parse(readFileSync(path.join(ROOT, "boundaries/compiled/colorado-4.json"), "utf8"));
  ok(Array.isArray(committed.center) && committed.center[0] === -103.5 && committed.center[1] === 39.5, "the committed colorado-4 artifact declares its eastern-plains anchor");
}

// 5. cross-repo: the REAL client (composer/bisect.mjs) verifies the committed colorado-4 artifact and
// bisects a body into it. Runs when a sibling checkout exists; skips honestly otherwise.
{
  const sibling = path.resolve(ROOT, "../anecdote.channel/composer/bisect.mjs");
  if (existsSync(sibling)) {
    const { verifyBoundary, bisect } = await import(sibling);
    const signed = JSON.parse(readFileSync(path.join(ROOT, "boundaries/compiled/colorado-4.json"), "utf8"));
    const v = await verifyBoundary(signed);
    const pinned = readBoundariesBlock(readFileSync(path.join(ROOT, "tell.yml"), "utf8"))[0].hash;
    ok(v.ok && v.id === pinned, "the REAL client verifies the committed artifact; id === tell.yml pin");
    const inside = await bisect([-103.5, 39.5], [signed]);
    const outside = await bisect([-107.0, 39.0], [signed]);
    ok(inside.length === 1 && inside[0].constituency === "colorado-4" && outside.length === 0,
       "the eastern plains bisect INTO colorado-4; the western slope does not — producer and consumer agree");
    const fpr = readFileSync(path.join(ROOT, "keys/boundary.fpr"), "utf8").trim();
    ok(v.by === fpr, "the artifact's signer matches the published keys/boundary.fpr");
  } else {
    console.log("  ok: (cross-repo client check SKIPPED — no sibling anecdote.channel checkout)");
  }
}

if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall boundary declaration tests passed");
