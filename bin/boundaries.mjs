#!/usr/bin/env node
// bin/boundaries — compile, pin, and RENEW this Tell's boundary declarations
// (notes/boundary-declaration.md; the ecosystem side is atlas.anecdote.channel/notes/boundary-canon.md).
//
// The two dress codes of one atom: boundaries/<slug>.geojson is the AUTHORING form (pure shape, any GIS
// tool round-trips it); boundaries/compiled/<slug>.json is the ATTESTED form — a signed
// anecdote.boundary/v1 object, the thing phones hold, verify, and bisect against
// (anecdote.channel/composer/bisect.mjs) and whose content id rides in presence claims and in tell.yml's
// per-boundary `hash` pin. This script compiles authoring → attested, checks the pins, and emits lease
// RENEWALS (boundaries/renewals/<slug>.<date>.json): the same assertion re-signed with a fresh date, so an
// Atlas computes "listed" from renewal freshness instead of storing state.
//
//   bin/boundaries compile   # geojson + tell.yml entry -> signed compiled artifact; prints the id to pin
//   bin/boundaries check     # CI-safe, keyless: pins match, signatures verify, geometry matches authoring
//   bin/boundaries renew     # re-sign each claim's id with a fresh date (the lease heartbeat)
//   bin/boundaries fpr       # print the boundary signer's public fingerprint (from the env key)
//
// SIGNING KEY: an Ed25519 pkcs8 at $TELL_BOUNDARY_KEY (default keys/boundary-signer.pk8, NEVER committed —
// .gitignore'd). The PUBLIC fingerprint is ALSO never committed (docs/decisions.md D1): it is derived from the
// env key, and `check` re-derives it (or reads $TELL_BOUNDARY_FPR) — nothing external pins it. Generated on
// first compile. Renewals MUST come from the same key — keep it like you keep TELL_SIGNER_KEY.
//
// FORMAT: the attestation exactly mirrors anecdote.channel/composer/sign.mjs (canonical JSON = sorted keys
// + undefined dropped; sig = { alg: "ed25519", by: "key:sha256:<hex>", key, signature }). Vendored here so
// the Tell repo stays self-contained; the cross-repo test (test/boundaries.test.mjs) verifies the compiled
// artifact with the REAL client verifier whenever a sibling anecdote.channel checkout is present.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const te = new TextEncoder();
const subtle = globalThis.crypto.subtle;
const b64 = (u8) => Buffer.from(u8).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---- the vendored attestation core (mirrors composer/sign.mjs — see FORMAT above) ---------------------
export function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
}
export async function defaultHash(bytes) { return "sha256:" + hex(new Uint8Array(await subtle.digest("SHA-256", bytes))); }
const fingerprint = async (rawPub) => "key:" + (await defaultHash(rawPub));

export async function attest(obj, identity) {
  const rest = { ...obj }; delete rest.sig;
  const signature = new Uint8Array(await subtle.sign({ name: "Ed25519" }, identity.privateKey, te.encode(canonicalize(rest))));
  return { ...rest, sig: { alg: "ed25519", by: identity.fingerprint, key: b64(identity.raw), signature: b64(signature) } };
}
export async function verifyAttested(obj) {
  if (!obj || !obj.sig || obj.sig.alg !== "ed25519") return { ok: false, by: null, errors: ["no ed25519 sig"] };
  const rest = { ...obj }; delete rest.sig;
  try {
    const key = await subtle.importKey("raw", unb64(obj.sig.key), { name: "Ed25519" }, true, ["verify"]);
    const ok = await subtle.verify({ name: "Ed25519" }, key, unb64(obj.sig.signature), te.encode(canonicalize(rest)));
    const by = await fingerprint(unb64(obj.sig.key));
    if (!ok) return { ok: false, by, errors: ["signature does not verify"] };
    if (by !== obj.sig.by) return { ok: false, by, errors: ["key fingerprint ≠ sig.by"] };
    return { ok: true, by, errors: [] };
  } catch (e) { return { ok: false, by: null, errors: ["verify threw: " + e.message] }; }
}

// ---- signer key (pkcs8; public fingerprint published) --------------------------------------------------
// Ed25519 pkcs8 carries the seed; derive the public half via jwk export of the private key.
async function signerFromPk8(pk8b64) {
  const pk8 = unb64(String(pk8b64).trim());
  const privateKey = await subtle.importKey("pkcs8", pk8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await subtle.exportKey("jwk", privateKey);
  const raw = unb64(jwk.x.replace(/-/g, "+").replace(/_/g, "/"));
  return { privateKey, raw, fingerprint: await fingerprint(raw) };
}

// The signer resolves from EITHER a file path OR — so there is NO file to mount in CI — the base64 pkcs8 key
// CONTENT itself, passed inline via $TELL_BOUNDARY_KEY (`TELL_BOUNDARY_KEY=${{ secrets.TELL_BOUNDARY_KEY }}
// bin/boundaries renew`). An existing file at `keyRef` wins; else a value that parses as a pkcs8 key is used
// as-is; else `compile` (create) mints a fresh key at `keyRef` as a path. `bin/boundary-bootstrap` sets the
// secret to the content for exactly this.
export async function loadOrCreateSigner(keyRef, { create = false } = {}) {
  if (keyRef && existsSync(keyRef)) return signerFromPk8(readFileSync(keyRef, "utf8"));
  if (keyRef) { try { return await signerFromPk8(keyRef); } catch { /* not inline key content — fall through */ } }
  if (!create) throw new Error(`boundaries: no signer at ${keyRef} — give a pkcs8 file path or the base64 key content (or run \`bin/boundaries compile\` to create one)`);
  const pair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pk8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  mkdirSync(path.dirname(keyRef), { recursive: true });
  writeFileSync(keyRef, b64(pk8) + "\n", { mode: 0o600 });
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, raw, fingerprint: await fingerprint(raw), created: true };
}

// ---- authoring form -> unsigned anecdote.boundary/v1 ---------------------------------------------------
export function geojsonToPolygons(gj) {
  const geom = gj.type === "Feature" ? gj.geometry : gj;
  const closeDropped = (ring) => {
    const r = ring.slice();
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    if (r.length < 3) throw new Error("boundaries: a ring needs 3+ distinct points");
    return r.map(([lon, lat]) => [lon, lat]);
  };
  if (geom.type === "Polygon") return [geom.coordinates.map(closeDropped)];
  if (geom.type === "MultiPolygon") return geom.coordinates.map((poly) => poly.map(closeDropped));
  throw new Error(`boundaries: unsupported geometry ${geom.type}`);
}

// The DECLARED anchor: your center of mass — "where you'd knock." A single [lon, lat] the Tell states about
// itself, NOT computed from the polygon (rounding math must never exile a member; membership is the filing,
// not the geometry). The Atlas dump tests THIS point against its own shape to observe `anchored` — so it
// only appears when the Tell chooses to declare it; its absence is honest silence (anchored: null).
export function declaredCenter(entry) {
  const c = entry.center;
  if (c == null) return undefined;
  if (!Array.isArray(c) || c.length !== 2 || !c.every((n) => typeof n === "number" && Number.isFinite(n)))
    throw new Error(`boundaries: ${entry.slug}: center must be [lon, lat] finite numbers, got ${JSON.stringify(c)}`);
  return [c[0], c[1]];
}

// The unsigned artifact: bisect.mjs's shape (schema/constituency/name/polygons/basis) plus the DECLARED
// extras — hard, the anchor, the relations — all covered by the signature (extra fields verify fine downstream).
export function buildArtifact(entry, gj) {
  const a = {
    schema: "anecdote.boundary/v1",
    constituency: entry.slug,
    name: entry.label || "",
    polygons: geojsonToPolygons(gj),
    basis: entry.basis || [],
    concept: entry.concept || "asserted",
    hard: !!entry.hard,
  };
  const center = declaredCenter(entry);
  if (center) a.center = center;
  for (const rel of ["derives", "disputes", "proposes"]) if (entry[rel]) a[rel] = entry[rel];
  return a;
}

// ---- a small YAML reader for tell.yml's boundaries block (this repo parses YAML with ruby in bash tests;
// here we need just this block, and we keep the dependency surface at zero) -----------------------------
export function readBoundariesBlock(yml) {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => /^boundaries:\s*$/.test(l));
  if (start < 0) return [];
  const entries = [];
  let cur = null, inBasis = false, inRel = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) && !/^\s*#/.test(l)) break;                 // left the block
    const strip = (s) => { const q = s.replace(/\s+#.*$/, "").trim(); return q.replace(/^"(.*)"$/, "$1"); };
    const m = l.match(/^(\s*)(- )?(\w[\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, indent, dash, key, rawVal] = m;
    const val = strip(rawVal);
    const parse = (v) =>
      v === "null" ? null : v === "true" ? true : v === "false" ? false
      : /^\[.*\]$/.test(v) ? JSON.parse(v)   // an inline array, e.g. center: [-103.5, 39.5]
      : v;
    if (dash && indent.length === 2) { cur = {}; entries.push(cur); inBasis = false; inRel = null; }
    if (!cur) continue;
    if (key === "basis" && val === "") { cur.basis = []; inBasis = true; inRel = null; continue; }
    if (["derives", "disputes", "proposes"].includes(key) && val === "") { cur[key] = {}; inRel = key; inBasis = false; continue; }
    if (dash && indent.length >= 6 && inBasis) { cur.basis.push({ [key]: parse(val) }); continue; }
    if (!dash && indent.length >= 8 && inBasis && cur.basis.length) { cur.basis[cur.basis.length - 1][key] = parse(val); continue; }
    if (!dash && indent.length >= 6 && inRel) { cur[inRel][key] = parse(val); continue; }
    if (indent.length === 4 || (dash && indent.length === 2)) { cur[key] = parse(val); inBasis = false; inRel = null; }
  }
  return entries;
}

// ---- the verbs ------------------------------------------------------------------------------------------
export async function compileAll(root, { create = true, now } = {}) {
  const keyPath = process.env.TELL_BOUNDARY_KEY || path.join(root, "keys/boundary-signer.pk8");
  const signer = await loadOrCreateSigner(keyPath, { create });
  const entries = readBoundariesBlock(readFileSync(path.join(root, "tell.yml"), "utf8"));
  const out = [];
  for (const entry of entries) {
    const gj = JSON.parse(readFileSync(path.join(root, entry.file), "utf8"));
    const signed = await attest(buildArtifact(entry, gj), signer);
    const id = await defaultHash(te.encode(canonicalize(signed)));
    const dest = path.join(root, "boundaries/compiled", `${entry.slug}.json`);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(signed, null, 2) + "\n");
    out.push({ slug: entry.slug, id, dest, pinned: entry.hash, signer: signer.fingerprint });
  }
  // The fingerprint is NOT committed (docs/decisions.md D1) — it is the operator's, derived from their env key.
  // It rides in the return value (and each compiled artifact's own sig.by); `check` re-derives it from the
  // environment. To have `check` confirm the identity in a keyless context, publish it as $TELL_BOUNDARY_FPR.
  return { signer, boundaries: out };
}

// The boundary signer's PUBLIC fingerprint is environment-sourced, never committed (anecdote.channel
// docs/decisions.md D1): nothing external pins it (an Atlas trusts each artifact's own signature and enforces
// same-key continuity itself — atlas bin/dump.mjs), so it is only the operator's own self-consistency check.
// `check` catches a signer swap by INTERNAL consistency alone (every compiled artifact shares one signer) — no
// key needed, so it still runs in a fork's CI — and, when the environment names the expected identity
// (TELL_BOUNDARY_FPR, or derivable from TELL_BOUNDARY_KEY), additionally confirms that one signer is the
// operator's key. `opts.expectFpr` overrides the environment (for tests).
export async function checkAll(root, { expectFpr } = {}) {
  const entries = readBoundariesBlock(readFileSync(path.join(root, "tell.yml"), "utf8"));
  const problems = [];
  const signers = new Set();
  let expect = expectFpr || process.env.TELL_BOUNDARY_FPR || null;
  if (!expect && process.env.TELL_BOUNDARY_KEY) {
    try { expect = (await loadOrCreateSigner(process.env.TELL_BOUNDARY_KEY, { create: false })).fingerprint; } catch { /* no key here → identity check skipped */ }
  }
  for (const entry of entries) {
    const dest = path.join(root, "boundaries/compiled", `${entry.slug}.json`);
    if (!existsSync(dest)) { problems.push(`${entry.slug}: no compiled artifact (run compile)`); continue; }
    const signed = JSON.parse(readFileSync(dest, "utf8"));
    const v = await verifyAttested(signed);
    if (!v.ok) { problems.push(`${entry.slug}: compiled artifact does not verify: ${v.errors.join("; ")}`); continue; }
    const id = await defaultHash(te.encode(canonicalize(signed)));
    if (entry.hash !== id) problems.push(`${entry.slug}: tell.yml pins ${entry.hash} but compiled artifact is ${id}`);
    const gj = JSON.parse(readFileSync(path.join(root, entry.file), "utf8"));
    const rebuilt = buildArtifact(entry, gj);
    const unsigned = { ...signed }; delete unsigned.sig;
    if (canonicalize(unsigned) !== canonicalize(rebuilt))
      problems.push(`${entry.slug}: compiled artifact drifted from authoring form (recompile or explain)`);
    signers.add(v.by);
    if (expect && v.by !== expect) problems.push(`${entry.slug}: signed by ${v.by}, but the environment expects ${expect}`);
  }
  // internal consistency: all compiled boundaries share ONE signer — a swap is caught with no pinned value.
  if (signers.size > 1) problems.push(`compiled boundaries are signed by ${signers.size} different keys (${[...signers].join(", ")}) — a signer swap; recompile under one key`);
  return problems;
}

export async function renewAll(root, { now } = {}) {
  const keyPath = process.env.TELL_BOUNDARY_KEY || path.join(root, "keys/boundary-signer.pk8");
  const signer = await loadOrCreateSigner(keyPath, { create: false });   // renewal NEVER mints a new key
  const entries = readBoundariesBlock(readFileSync(path.join(root, "tell.yml"), "utf8"));
  const at = now || new Date().toISOString();
  const out = [];
  for (const entry of entries) {
    const dest = path.join(root, "boundaries/compiled", `${entry.slug}.json`);
    const signed = JSON.parse(readFileSync(dest, "utf8"));
    const id = await defaultHash(te.encode(canonicalize(signed)));
    const renewal = await attest({ schema: "anecdote.boundary-renewal/v1", boundary: id, slug: entry.slug, at }, signer);
    const rdir = path.join(root, "boundaries/renewals");
    mkdirSync(rdir, { recursive: true });
    const rpath = path.join(rdir, `${entry.slug}.${at.slice(0, 10)}.json`);
    writeFileSync(rpath, JSON.stringify(renewal, null, 2) + "\n");
    out.push({ slug: entry.slug, boundary: id, at, rpath });
  }
  return out;
}

// ---- CLI -------------------------------------------------------------------------------------------------
async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mode = process.argv[2] || "compile";
  if (mode === "compile") {
    const { signer, boundaries } = await compileAll(root);
    if (signer.created) console.log(`new boundary signer created — keep ${process.env.TELL_BOUNDARY_KEY || "keys/boundary-signer.pk8"} like you keep TELL_SIGNER_KEY`);
    console.log(`signer: ${signer.fingerprint}  (environment-sourced — set TELL_BOUNDARY_FPR to this so keyless \`check\` can confirm it)`);
    for (const bd of boundaries) {
      console.log(`${bd.slug}: ${bd.id}`);
      if (bd.pinned !== bd.id) console.log(`  → pin it: set \`hash: ${bd.id}\` on the ${bd.slug} entry in tell.yml`);
    }
  } else if (mode === "check") {
    const problems = await checkAll(root);
    if (problems.length) { for (const p of problems) console.error("FAIL: " + p); process.exit(1); }
    console.log("boundaries: all pins match, all signatures verify, authoring and compiled agree");
  } else if (mode === "renew") {
    for (const r of await renewAll(root)) console.log(`renewed ${r.slug} (${r.boundary}) at ${r.at} → ${path.relative(root, r.rpath)}`);
  } else if (mode === "fpr") {
    const keyPath = process.env.TELL_BOUNDARY_KEY || path.join(root, "keys/boundary-signer.pk8");
    console.log((await loadOrCreateSigner(keyPath, { create: false })).fingerprint);
  } else {
    console.error("usage: bin/boundaries [compile|check|renew|fpr]"); process.exit(2);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
