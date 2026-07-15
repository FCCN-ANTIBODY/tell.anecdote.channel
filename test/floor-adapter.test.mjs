// Unit: floor/adapter — the vendored storage-adapter consumer bootstrap (the glove) and the open-seam that
// drives it. Exercises the REAL vendored modules (sign → install → install-loader → open-engine) through
// makeOpen: with a test platform pin, an engine's install manifest verifies and its client is worn and
// driven; with no pin the seam is inert; with a wrong pin nothing mounts and the embed is torn down. The
// real Blob-URL import + cross-origin port are Chromium-verified upstream; here mount/import is injected.
// Run: node test/floor-adapter.test.mjs
import { makeOpen } from "../floor/adapter/open-seam.mjs";
import { mintInstall } from "../floor/adapter/install.mjs";
import { generateIdentity } from "../floor/adapter/sign.mjs";
import fs from "fs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// A fake embed: iframe a bottle → { client, teardown }. The client's invoke serves `install` (the pre-minted
// manifest) and a canned `git.log` frame — the same port the delivered client drives back through.
function fakeEmbed(manifest, opFrames = {}) {
  const state = { torn: false, url: null, calls: [] };
  const embed = (url) => {
    state.url = url;
    const invoke = (op, input, opts = {}) => {
      state.calls.push({ op, opts });
      if (op === "install") return Promise.resolve({ frames: [manifest] });
      return Promise.resolve({ frames: [opFrames[op] || { echo: op }] });
    };
    return Promise.resolve({ client: { invoke }, teardown: () => { state.torn = true; } });
  };
  return { embed, state };
}

async function run() {
  const platform = await generateIdentity();
  // the engine's publish step (done offline): a tiny client whose default export is make(invoke).
  const clientSrc = "export default (invoke) => ({ log: () => invoke('git.log', {}).then((r) => r.frames[0]) });\n";
  const manifest = await mintInstall({ "client.mjs": clientSrc }, "client.mjs", platform);
  const loadOpts = { createURL: (b, n) => "blob:" + n, revokeURL: () => {}, importer: () => import("../floor/adapter/probe-client.mjs").then(() => ({ default: (invoke) => ({ log: () => invoke("git.log", {}).then((r) => r.frames[0]) }) })) };

  // 1. no pin → no seam (the safe default; a plain pile load never wires this).
  ok(makeOpen({ platformKey: null }) === null, "no pin → makeOpen returns null (adapter stays inert)");

  // 2. wired: makeOpen drives the vendored bootstrap end to end against the test pin.
  {
    const { embed, state } = fakeEmbed(manifest, { "git.log": { log: [{ oid: "c".repeat(40), message: "one" }] } });
    const open = makeOpen({ platformKey: platform.fingerprint, embed, loadOpts });
    ok(typeof open === "function", "a pin yields an open seam");
    const handle = open({ url: "https://git-enough.bottles.anecdote.channel/", adapter: "git-enough" });
    ok(handle.engine === "https://git-enough.bottles.anecdote.channel/", "the handle names the engine it reached for");
    const opened = await handle.opened;
    ok(state.url === "https://git-enough.bottles.anecdote.channel/", "the seam embedded the engine bottle url");
    ok(state.calls[0].op === "install" && !state.calls[0].opts.confirmed, "install is asked first, Rung 0 (unconfirmed)");
    ok((await opened.client.log()).log[0].message === "one", "the worn client drives the engine back over the same probe");
    ok(typeof opened.teardown === "function" && typeof opened.revoke === "function", "teardown (iframe/port) and revoke (blobs) both come back");
  }

  // 3. wrong pin → nothing mounts and the embed is torn back down (verify runs before the entry could import).
  {
    const impostor = await generateIdentity();
    const badManifest = await mintInstall({ "client.mjs": clientSrc }, "client.mjs", impostor);
    const { embed, state } = fakeEmbed(badManifest);
    const open = makeOpen({ platformKey: platform.fingerprint, embed, loadOpts });
    let threw = false;
    try { await open({ url: "https://git-enough.bottles.anecdote.channel/", adapter: "git-enough" }).opened; } catch { threw = true; }
    ok(threw && state.torn, "an engine not signed by the pin mounts nothing and the embed is torn down");
  }

  // 4. no network surface anywhere in the vendored adapter tree (the floor's promise, extended to the glove).
  for (const f of fs.readdirSync(new URL("../floor/adapter/", import.meta.url)).filter((n) => n.endsWith(".mjs")).map((n) => "floor/adapter/" + n)) {
    const src = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    ok(!/\bfetch\s*\(/.test(src) && !/XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/.test(src), f + " has no network surface (the iframe is the only outward surface)");
  }

  console.log(fails ? `\nFAILED (${fails})` : "\nok: floor-adapter — the glove installs against the pin, wears the engine's client, and drives it; no pin, no reach");
  process.exit(fails ? 1 : 0);
}
run();
