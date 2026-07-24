// test/adapter-live-ui.test.mjs — THE STAMPED FLOOR WEARS THE GLOVE, live. floor-ui.test.mjs proves the
// committed default (no pin → the adapter names its engine and reaches for nothing); this suite proves the
// OTHER half the docs promise: run `bin/floor-build` with ANECDOTE_PLATFORM_KEY in the environment (the D1
// slot-fill), serve the BUILT site on a made-up wildcard name, and the shipped /storage/.git page — the
// floor's own vendored adapter seam, nothing injected — embeds the engine's canonical bottle, verifies the
// platform-signed install against the stamped pin, WEARS the delivered client, and drives real git through
// it: a pile-shaped repo stood up inside the bottle from the floor's own page.
//
//   ANECDOTE_REPO=path/to/anecdote.channel  node test/adapter-live-ui.test.mjs
//
// The platform identity is minted in the test environment; the bottle is provisioned the honest way (the
// inception slot stamped in the served copy). Skips cleanly without the sibling checkout, a Chromium, or
// the 443 bind.
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import os from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const anecdote = process.env.ANECDOTE_REPO || join(root, "..", "anecdote.channel");
if (!existsSync(join(anecdote, "probe-test", "harness.mjs")) || !existsSync(join(anecdote, "git-enough", "bottle-boot.mjs"))) {
  console.log("skip: no anecdote.channel checkout with probe-test/ + the bottle boot (set ANECDOTE_REPO)");
  process.exit(0);
}
const { findChromium, withPage } = await import(pathToFileURL(join(anecdote, "probe-test", "harness.mjs")));
const { generateIdentity } = await import(pathToFileURL(join(anecdote, "composer", "sign.mjs")));
const { mintBottleAttestation } = await import(pathToFileURL(join(anecdote, "composer", "bottle-attest.mjs")));
const { mintInstall } = await import(pathToFileURL(join(anecdote, "composer", "install.mjs")));

const chromium = findChromium();
if (!chromium) {
  console.log("skip: no chromium in this environment (set CHROMIUM=/path/to/chromium to run)");
  process.exit(0);
}

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// ---- provision, node-side: the platform identity, the bottle, and the STAMPED floor site --------

const platform = await generateIdentity();
const attestation = await mintBottleAttestation("https://git.bottles.anecdote.channel/", platform, { now: "2026-07-24T00:00:00.000Z" });
const clientSource = readFileSync(join(anecdote, "git-enough", "git-client.mjs"), "utf8");
const manifest = await mintInstall({ "git-client.mjs": clientSource }, "git-client.mjs", platform);

const floorSite = mkdtempSync(join(os.tmpdir(), "floor-live-"));
execFileSync(join(root, "bin", "floor-build"), [floorSite], {
  env: { ...process.env, ANECDOTE_PLATFORM_KEY: platform.fingerprint }, stdio: "ignore",
});
const stamped = readFileSync(join(floorSite, "adapter", "platform-key.mjs"), "utf8");
ok(stamped.includes(platform.fingerprint), "floor-build stamped the environment's fingerprint into the built adapter pin");

const origins = {
  "parks-2026.tell.anecdote.channel": { root: floorSite, fallback: "index.html" },
  "git.bottles.anecdote.channel": {
    root: anecdote,
    tree: {
      "index.html": `<!doctype html><meta charset="utf-8"><title>bottle</title>\n<script type="module">import { bootBottle } from "/git-enough/bottle-boot.mjs"; bootBottle();</script>`,
      "git-enough/bottle-inception.mjs":
        `export const INCEPTION = ${JSON.stringify({ attestation, platformKey: platform.fingerprint, manifest })};\nexport default INCEPTION;\n`,
    },
  },
};

const ran = await withPage({ chromium, tls: true, origins }, async (page, { server }) => {
  await page.goto("https://parks-2026.tell.anecdote.channel/storage/.git");

  // The shipped page, in adapter role, with a LIVE pin: it announces consumption, not inertness.
  const notice = await page.waitFor("(((document.getElementById('notice')||{}).textContent||'').includes('storage adapter')) && document.getElementById('notice').textContent");
  ok(notice.includes("consuming https://git.bottles.anecdote.channel/ over the probe"), "the adapter names its engine and reaches for it");
  ok(!notice.includes("bootstrap not wired"), "…no longer inert: the stamped pin wired the open seam");

  // The glove closes: the seam's handle resolves to a WORN client (verified, mounted, imported).
  const worn = await page.waitFor(
    "window.__FLOOR_BOOT__ && window.__FLOOR_BOOT__.handle && window.__FLOOR_BOOT__.handle.opened" +
    ".then((o) => { window.__opened = o; return { client: !!o.client, entry: o.verified.entry }; })", { timeout: 60000 });
  ok(worn.client === true && worn.entry === "git-client.mjs",
     "the floor wears the client the bottle delivered — verified against the stamped pin");

  // Drive it: the pile-hosting gesture through the floor's own seam.
  const init = await page.eval(`window.__opened.client.init(
    [{ path: "pile.yml", content: 'id: "parks-2026"\\n' }, { path: "README.md", content: "# the pile\\n" }],
    { message: "pile-new: parks-2026 (from the stamped floor)\\n" }).then((r) => ({ init: r.init, tip: r.tip }))`);
  ok(init.init === true && /^[0-9a-f]{40}$/.test(init.tip), "the worn client stood a pile-shaped repo up inside the bottle");
  const files = await page.eval("window.__opened.client.files().then((r) => r.files.map((f) => f.path).sort().join('|'))");
  ok(files === "README.md|pile.yml", "…and the floor reads the hosted file-set back through the same port");

  // The whole exchange stayed between the floor's name and the engine's bottle.
  const hosts = [...new Set(page.requests.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).hostname))];
  ok(hosts.every((h) => h === "parks-2026.tell.anecdote.channel" || h === "git.bottles.anecdote.channel"),
     "every request stayed between the floor and its engine: " + hosts.join(", "));
  ok(server.foreign.length === 0, "no request escaped to any host the test did not stand up"
     + (server.foreign.length ? " — leaked: " + JSON.stringify(server.foreign) : ""));
});

rmSync(floorSite, { recursive: true, force: true });
if (!ran) { console.log("skip: could not bind 443 for the tls transport (root/CAP_NET_BIND_SERVICE, or sysctl net.ipv4.ip_unprivileged_port_start=443)"); process.exit(0); }
if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall live-adapter UI tests passed (the stamped floor wears the glove and hosts a repo in the bottle)");
