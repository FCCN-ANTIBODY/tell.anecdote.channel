#!/usr/bin/env node
// tell.anecdote.channel/bin/rollup.mjs — the on-device port of bin/rollup (bash). Same contract, no shell:
// jq dissolves into native JSON. Reads the authorized submissions bin/collect-submissions staged for a
// pile under $TELL_SUBMISSIONS_DIR/<id>/ and folds them into one plaintext digest on stdout (empty stdout
// = "nothing new"; deliver skips the pile). Byte-compatible with the bash bin except window_end (a
// timestamp) — proven field-for-field against it in test/run.sh. Override via TELL_ROLLUP_CMD, same as bash.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const id = process.argv[2];
if (!id) { process.stderr.write("usage: bin/rollup <id> [scope]\n"); process.exit(1); }
const scope = process.argv[3] || "";
const here = dirname(fileURLToPath(import.meta.url));
const stage = join(process.env.TELL_SUBMISSIONS_DIR || join(here, "..", ".submissions"), id);

// No staged submissions this window → emit nothing (deliver skips). Match the shell glob's sorted order.
let files;
try { files = readdirSync(stage).filter((f) => f.endsWith(".json")).sort(); } catch { process.exit(0); }
if (!files.length) process.exit(0);
const subs = files.map((f) => JSON.parse(readFileSync(join(stage, f), "utf8")));

// jq truthiness: only null/false are falsy (0 and "" are truthy). `//` and `?? ` default on null/false.
const truthy = (v) => v !== null && v !== undefined && v !== false;
const orNull = (v) => (v === undefined ? null : v);
const alt = (v, d) => (v === null || v === undefined || v === false ? d : v);

// Fold each accepted answer into a record (the base fields always present; the rest added when truthy).
const records = subs.map((r) => {
  const rec = { issue: orNull(r.number), poll: orNull(r.poll), type: orNull(r.type), asker: orNull(r.asker),
    shown_guidance: orNull(r.shown_guidance), round: orNull(r.round), answer: orNull(r.answer), ts: orNull(r.ts) };
  if (truthy(r.source)) rec.source = r.source;
  if (truthy(r.comment)) rec.comment = r.comment;
  if (truthy(r.run)) rec.run = r.run;
  if (truthy(r.nonce)) rec.nonce = r.nonce;
  if (truthy(r.anecdote)) rec.anecdote = r.anecdote;
  if (truthy(r.governed)) { rec.governed = r.governed; rec.govern_reason = orNull(r.govern_reason); rec.constitution_sha = orNull(r.constitution_sha); }
  if (truthy(r.voucher)) rec.voucher = r.voucher;
  return rec;
});

// The COARSE, non-identifying voucher summary — gradient histograms + confidence ranges, never a value.
const tally = (vals) => { const o = {}; for (const v of vals) o[v] = (o[v] || 0) + 1; return o; };
const vouch = {
  schema: "tell.voucher.summary/v1",
  count: subs.length,
  location: {
    gradients: tally(subs.map((r) => r.voucher?.location?.gradient).filter((g) => g !== null && g !== undefined)),
    min_confidence: Math.min(...subs.map((r) => alt(r.voucher?.location?.confidence, 0))),
    max_confidence: Math.max(...subs.map((r) => alt(r.voucher?.location?.confidence, 0))),
  },
  source: {
    kinds: tally(subs.map((r) => alt(r.voucher?.source?.kind, "asserted"))),
    min_confidence: Math.min(...subs.map((r) => alt(r.voucher?.source?.confidence, 0))),
    max_confidence: Math.max(...subs.map((r) => alt(r.voucher?.source?.confidence, 0))),
  },
};

const window_end = process.env.TELL_ROLLUP_AT || new Date().toISOString().replace(/\.\d+Z$/, "Z");
process.stdout.write(JSON.stringify({
  schema: "tell.digest/v1", pile: id, scope, window_end, count: records.length, vouch, records,
}, null, 2) + "\n");
