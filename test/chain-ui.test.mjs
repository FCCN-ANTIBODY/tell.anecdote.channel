// test/chain-ui.test.mjs — THE PUPPETED CHAIN, end to end in one real Chromium: a data-pile's room
// (the Floor at a made-up <name>.tell.anecdote.channel) puppets the one answer layout by pointing its
// stage at vanilla Tell, exactly the way a QR would; Tell renders its tokenless PREVIEW branch for the
// Floor, and forwards a live (tok-bearing) query VERBATIM to the runtime, anecdote.channel/poll.html,
// where the powerless data: chamber composes the reply. Three repos' shipped bytes, three real
// origins, one browser — this is the seam the whole "config UI reuses the answer UI" story crosses.
//
//   ANECDOTE_REPO=path/to/anecdote.channel  node test/chain-ui.test.mjs
//
// Tell's landing is a Jekyll page, so the suite builds this repo's site with anecdote.channel's
// jekyll-enough (the offline-origin build) and serves THAT — the same bytes a deploy would publish.
// Skips cleanly when the sibling checkout, a Chromium, or the 443 bind is unavailable.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const anecdote = process.env.ANECDOTE_REPO || join(root, "..", "anecdote.channel");
if (!existsSync(join(anecdote, "probe-test", "harness.mjs"))) {
  console.log("skip: no anecdote.channel checkout with probe-test/ (set ANECDOTE_REPO)");
  process.exit(0);
}
const { findChromium, withPage } = await import(pathToFileURL(join(anecdote, "probe-test", "harness.mjs")));
const { buildSite } = await import(pathToFileURL(join(anecdote, "jekyll-enough", "build.mjs")));

const chromium = findChromium();
if (!chromium) {
  console.log("skip: no chromium in this environment (set CHROMIUM=/path/to/chromium to run)");
  process.exit(0);
}

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// Build tell.anecdote.channel the way a deploy would — jekyll-enough over this repo's own tree.
const tree = {};
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const r = relative(root, p);
    if (r.startsWith(".git")) continue;
    if (statSync(p).isDirectory()) walk(p);
    else tree[r] = readFileSync(p, "utf8");
  }
};
walk(root);
const built = buildSite(tree, { lenient: true });
const site = {};
for (const [path, content] of Object.entries(built)) site[path.replace(/^_site\//, "")] = content;
if (!site["index.html"] || !site["index.html"].includes("tell-poll")) {
  console.error("FAIL: jekyll-enough did not build the landing");
  process.exit(1);
}

const TERMS = "sha256:" + "cd".repeat(32);
const QUESTION = { schema: "anecdote.poll/v1", poll: "north-meadow", text: "What should the north meadow become?",
                   options: ["a dog park", "a wetland"], guidance: "One idea per reply.", constitution: TERMS,
                   lifecycle: { round: 1 } };

const origins = {
  "parks-2026.tell.anecdote.channel": { root: join(root, "floor"), fallback: "index.html" },
  "tell.anecdote.channel": { tree: site },
  "anecdote.channel": { root: anecdote },
};

const ran = await withPage({ chromium, tls: true, origins }, async (page, { server }) => {
  // ---- the Floor puppets the preview: pile room → stage → vanilla Tell -------------------------
  await page.goto("https://parks-2026.tell.anecdote.channel/");
  await page.waitFor("document.getElementById('import').style.display === 'block'");
  await page.eval(`
    document.querySelector('#import textarea').value = ${JSON.stringify(JSON.stringify(QUESTION))};
    document.querySelector('#import button').click();
  `);
  await page.waitFor("document.getElementById('viewer').style.display === 'flex'");
  const src = await page.eval("document.getElementById('stage').src");
  ok(src.startsWith("https://tell.anecdote.channel/?"), "the pile's stage aims at vanilla Tell");

  const inTell = { frame: "https://tell.anecdote.channel/" };
  const q = await page.waitFor("(document.querySelector('.tell-question')||{}).textContent || ''", inTell);
  ok(q === QUESTION.text, "Tell's preview renders the pile's question inside the Floor's stage");
  const opts = await page.eval("[...document.querySelectorAll('.tell-opts li')].map((li) => li.textContent)", inTell);
  ok(opts.join("|") === "a dog park|a wetland", "the suggestions ride through the display params");
  const terms = await page.eval("(document.querySelector('.tell-constitution')||{}).textContent || ''", inTell);
  ok(terms.includes(TERMS.slice(0, 23)), "the question's constitution surfaces in the preview — the forced law is visible");
  const tag = await page.eval("(document.querySelector('.tell-preview-tag')||{}).textContent || ''", inTell);
  ok(tag.includes("no live token"), "tokenless is PREVIEW: no reply can be composed from the Floor's stage");

  // ---- a live QR forwards verbatim to the runtime, and the chamber composes --------------------
  const live = "pile=parks-2026&poll=north-meadow&round=1&tok=TESTTOK"
    + "&q=" + encodeURIComponent(QUESTION.text)
    + "&opts=" + encodeURIComponent(QUESTION.options.join(","))
    + "&constitution=" + TERMS;
  await page.goto("https://tell.anecdote.channel/?" + live);
  await page.waitFor("location.hostname === 'anecdote.channel'");
  const landed = await page.eval("location.pathname + location.search");
  ok(landed === "/poll.html?" + live, "Tell forwards the live query to the runtime VERBATIM — byte for byte");
  const answered = await page.waitFor("(document.querySelector('h3')||{}).textContent || ''", { frame: "data:" });
  ok(answered === QUESTION.text, "the runtime's chamber renders the same question — one layout, both doors");
  const env = await page.waitFor("(document.getElementById('env')||{}).textContent || ''", { frame: "data:" });
  ok(env.includes("origin:null"), "and it composes in a powerless null-origin chamber, same as ever");

  // ---- the whole chain stayed inside the constellation -----------------------------------------
  const hosts = [...new Set(page.requests.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).hostname))];
  ok(hosts.every((h) => h === "anecdote.channel" || h.endsWith("tell.anecdote.channel")),
     "every request stayed on the three constellation origins: " + hosts.join(", "));
  ok(server.foreign.length === 0, "no request escaped to any host the test did not stand up");
});

if (!ran) { console.log("skip: could not bind 443 for the tls transport (root/CAP_NET_BIND_SERVICE, or sysctl net.ipv4.ip_unprivileged_port_start=443)"); process.exit(0); }
if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall chain UI tests passed (Floor → Tell → runtime, three origins, one browser)");
