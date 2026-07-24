// test/room-ui.test.mjs — DECRYPT IN THE ROOM: the custody promise, visible. Tell's REAL producer
// (bin/deliver — age + openssl + ssh-keygen, including the append/ratchet-resume path) seals a feed;
// a browser at the pile's own wildcard name — WebCrypto only, no age, no openssl, no jq — pulls it
// from Tell's public surface, verifies the signed chain (data-pile bin/feed-open.mjs with the ssh-sig
// verifier injected from anecdote.channel), and reads the plaintext with the owner's held identity.
// The floor doc's "decryption in the room" deferral, closed at the capability layer: the room's origin
// can do the whole consumer loop; what remains for the shipped floor is only how the identity ARRIVES
// (the Elevated-guest consent surface), not whether the room can read.
//
//   ANECDOTE_REPO=… DP_REPO=… node test/room-ui.test.mjs
//
// Skips cleanly without the sibling checkouts, the producer tools, a Chromium, or the 443 bind.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import os from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const anecdote = process.env.ANECDOTE_REPO || join(root, "..", "anecdote.channel");
const dataPile = process.env.DP_REPO || join(root, "..", "data-pile");
if (!existsSync(join(anecdote, "probe-test", "harness.mjs")) || !existsSync(join(dataPile, "bin", "feed-open.mjs"))) {
  console.log("skip: need sibling checkouts of anecdote.channel (probe-test) and data-pile (bin/feed-open.mjs)");
  process.exit(0);
}
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts });
for (const tool of ["age", "age-keygen", "openssl", "jq", "ssh-keygen"]) {
  try { sh("which", [tool]); } catch { console.log(`skip: ${tool} not available for the producer`); process.exit(0); }
}
const { findChromium, withPage } = await import(pathToFileURL(join(anecdote, "probe-test", "harness.mjs")));
const chromium = findChromium();
if (!chromium) { console.log("skip: no chromium in this environment (set CHROMIUM=/path/to/chromium to run)"); process.exit(0); }

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// ---- the producer: Tell seals a real feed, genesis + append ---------------------------------------
const work = mkdtempSync(join(os.tmpdir(), "room-ui-"));
sh("age-keygen", ["-o", join(work, "owner.txt")], { stdio: ["ignore", "ignore", "ignore"] });
const identity = readFileSync(join(work, "owner.txt"), "utf8").split("\n").find((l) => l.startsWith("AGE-SECRET-KEY-"));
const recipient = sh("age-keygen", ["-y", join(work, "owner.txt")]).trim();
sh("age-keygen", ["-o", join(work, "tell-id.txt")], { stdio: ["ignore", "ignore", "ignore"] });
sh("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "tell-signer", "-f", join(work, "sign")], { stdio: ["ignore", "ignore", "ignore"] });
const signerLine = readFileSync(join(work, "sign.pub"), "utf8").trim();

const RECORDS = [
  'first sealed digest — "the north meadow" answers\n',
  "second sealed digest — appended in a later delivery\n",
];
writeFileSync(join(work, "b0"), RECORDS[0]);
writeFileSync(join(work, "b1"), RECORDS[1]);
const feed = join(work, "feed");
const env = { ...process.env, TELL_IDENTITY_FILE: join(work, "tell-id.txt") };
sh(join(root, "bin", "deliver"), ["--dir", feed, "--recipient", recipient, "--signkey", join(work, "sign"), "--block", join(work, "b0")], { env, stdio: ["ignore", "ignore", "ignore"] });
sh(join(root, "bin", "deliver"), ["--dir", feed, "--recipient", recipient, "--signkey", join(work, "sign"), "--block", join(work, "b1")], { env, stdio: ["ignore", "ignore", "ignore"] });

// Tell's public surface: the inbox files at piles/<id>/feed/, plus a tampered copy for the refusal.
const inbox = join(feed, "inbox");
const feedTree = {};
for (const f of readdirSync(inbox)) feedTree["piles/parks-2026/feed/" + f] = readFileSync(join(inbox, f));
const doctoredBlock = new Uint8Array(feedTree["piles/parks-2026/feed/" + JSON.parse(readFileSync(join(inbox, "manifest.json"), "utf8")).entries[0].block]);
doctoredBlock[0] ^= 1;
for (const [p, b] of Object.entries(feedTree)) feedTree[p.replace("/feed/", "/tampered/")] = b;
feedTree["piles/parks-2026/tampered/" + JSON.parse(readFileSync(join(inbox, "manifest.json"), "utf8")).entries[0].block] = doctoredBlock;

// ---- the room: the pile's own name-origin, WebCrypto only -----------------------------------------
const FIXTURE = `<!doctype html><meta charset="utf-8"><title>the room reads</title>
<script type="module">
import { verifyFeed, openFeed } from "https://pile.example/bin/feed-open.mjs";
import { verify as sshVerify, rawFromPublic } from "https://anecdote.channel/composer/ssh-sig.mjs";
window.R = { stage: "boot" };
const rawPub = rawFromPublic(${JSON.stringify(signerLine)});
const verifySignature = ({ message, armored, namespace }) => sshVerify(message, armored, { namespace, rawPub });
const pull = async (base) => {
  const manifest = await (await fetch(base + "manifest.json")).json();
  const blocks = {};
  for (const e of manifest.entries) blocks[e.block] = new Uint8Array(await (await fetch(base + e.block)).arrayBuffer());
  const seedAge = new Uint8Array(await (await fetch(base + "seed.age")).arrayBuffer());
  return { manifest, blocks, seedAge };
};
try {
  window.R.stage = "pull";
  const good = await pull("https://tell.anecdote.channel/piles/parks-2026/feed/");
  window.R.stage = "verify";
  const v = await verifyFeed({ manifest: good.manifest, blocks: good.blocks, verifySignature });
  window.R.stage = "open";
  const opened = v.ok ? await openFeed({ ...good, identity: ${JSON.stringify(identity)} }) : null;
  window.R.stage = "tamper";
  const bad = await pull("https://tell.anecdote.channel/piles/parks-2026/tampered/");
  const tam = await verifyFeed({ manifest: bad.manifest, blocks: bad.blocks, verifySignature });
  window.R = { stage: "done",
    verified: { ok: v.ok, entries: v.entries, by: v.signed && v.signed.by },
    texts: opened ? opened.records.map((r) => r.text) : null,
    tampered: { ok: tam.ok, reason: tam.reason || null },
    subtle: typeof crypto.subtle, origin: location.origin };
} catch (e) { window.R = { stage: "error", error: String(e && e.message || e), at: window.R.stage }; }
</script>`;

const origins = {
  "parks-2026.tell.anecdote.channel": { tree: { "index.html": FIXTURE } },   // the pile's own room
  "tell.anecdote.channel": { tree: feedTree },                               // Tell's public surface
  "pile.example": { root: dataPile },                                       // the consumer core's modules
  "anecdote.channel": { root: anecdote },                                   // the ssh-sig verifier
};

const ran = await withPage({ chromium, tls: true, origins }, async (page, { server }) => {
  await page.goto("https://parks-2026.tell.anecdote.channel/");
  const R = await page.waitFor("window.R && (window.R.stage === 'done' || window.R.stage === 'error') && window.R", { timeout: 60000 });
  if (R.stage === "error") { ok(false, `room failed at stage '${R.at}': ${R.error}`); return; }

  ok(R.origin === "https://parks-2026.tell.anecdote.channel" && R.subtle === "object",
     "the room is the pile's own name-origin, secure, WebCrypto live");
  ok(R.verified.ok === true && R.verified.entries === 2 && !!R.verified.by,
     "the room verified the Tell-signed chain in JS (signer " + R.verified.by + "), across the append/resume");
  ok(Array.isArray(R.texts) && R.texts.length === 2 && R.texts[0] === RECORDS[0] && R.texts[1] === RECORDS[1],
     "the held identity opened both blocks — the owner READS the pile in the room, plaintext exact");
  ok(R.tampered.ok === false && /tampered at seq 0/.test(R.tampered.reason || ""),
     "a tampered public copy refuses in the room: " + R.tampered.reason);

  const hosts = [...new Set(page.requests.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).hostname))];
  ok(hosts.every((h) => ["parks-2026.tell.anecdote.channel", "tell.anecdote.channel", "pile.example", "anecdote.channel"].includes(h)),
     "the room reached only its own name, Tell's surface, and the module origins: " + hosts.join(", "));
  ok(server.foreign.length === 0, "no request escaped to any host the test did not stand up"
     + (server.foreign.length ? " — leaked: " + JSON.stringify(server.foreign) : ""));
});

rmSync(work, { recursive: true, force: true });
if (!ran) { console.log("skip: could not bind 443 for the tls transport (root/CAP_NET_BIND_SERVICE, or sysctl net.ipv4.ip_unprivileged_port_start=443)"); process.exit(0); }
if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall room UI tests passed (the pile's room pulls, verifies, and READS a real Tell delivery)");
