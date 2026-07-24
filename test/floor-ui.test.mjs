// test/floor-ui.test.mjs — the Floor driven in a REAL Chromium, on its REAL wildcard names. The pure
// suites (floor.test.mjs, floor-adapter.test.mjs) pin the logic with injected stubs; this one proves
// the shipped page itself: a made-up <name>.tell.anecdote.channel serves the one template, the name
// mints a hermetic vault, the creator writes a question and hands back the two carry artifacts, the
// viewer's one stage aims at vanilla Tell with display params and never a credential, and the page
// fetches nothing beyond its own origin. The harness is anecdote.channel's probe-test (the sibling
// checkout, like DP_REPO for the data-pile cross-check): every hostname resolves to the harness
// server over real https, so the shipped bytes run UNMODIFIED — absolute pins included.
//
//   ANECDOTE_REPO=path/to/anecdote.channel  node test/floor-ui.test.mjs
//
// Skips cleanly when the sibling checkout, a Chromium, or the 443 bind is unavailable.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const anecdote = process.env.ANECDOTE_REPO || join(root, "..", "anecdote.channel");
const harnessPath = join(anecdote, "probe-test", "harness.mjs");
if (!existsSync(harnessPath)) {
  console.log("skip: no anecdote.channel checkout with probe-test/ (set ANECDOTE_REPO)");
  process.exit(0);
}
const { findChromium, withPage } = await import(pathToFileURL(harnessPath));

const chromium = findChromium();
if (!chromium) {
  console.log("skip: no chromium in this environment (set CHROMIUM=/path/to/chromium to run)");
  process.exit(0);
}

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } else console.log("  ok: " + m); };

// The wildcard mask, emulated at the edge the way DNS/Cloudflare do it in production: every made-up
// name serves the SAME floor site, any path falling back to the one template. The mother host serves
// the repo so /floor/ stays inspectable in place.
const floorSite = { root: join(root, "floor"), fallback: "index.html" };
const origins = {
  "parks-2026.tell.anecdote.channel": floorSite,
  "quiet-creek.tell.anecdote.channel": floorSite,
  "tell.anecdote.channel": { root },
};

const ran = await withPage({ chromium, tls: true, origins }, async (page, { server }) => {
  // The template, viewed on the mother host: not a named floor — the blank-slate explainer.
  // (Wait for the booted text itself, not just a non-empty notice — the markup ships an "…"
  // placeholder that is already truthy before floor.mjs runs.)
  await page.goto("https://tell.anecdote.channel/floor/");
  const notice = await page.waitFor("(((document.getElementById('notice')||{}).textContent||'').includes('Floor template')) && document.getElementById('notice').textContent");
  ok(notice.includes("Floor template"), "the mother host shows the template, not a vault");
  ok(await page.eval("document.getElementById('pile-address').textContent") === "", "no pile address without a name");

  // A made-up name IS the key: the origin mints its vault and opens straight into the creator.
  await page.goto("https://parks-2026.tell.anecdote.channel/");
  await page.waitFor("document.getElementById('creator').style.display === 'block'");
  ok(await page.eval("document.getElementById('pile-address').textContent") === "anecdote://data/parks-2026",
     "the name mints the pile's address: anecdote://data/parks-2026");
  ok((await page.eval("document.getElementById('creator-heading').textContent")).includes("parks-2026's first question"),
     "an empty pile opens straight into asking its first question");

  // Create a question in the room.
  await page.eval(`
    document.querySelector('#creator input[name=poll]').value = 'north-meadow';
    document.querySelector('#creator textarea[name=text]').value = 'What should the north meadow become?';
    document.querySelector('#creator input[name=options]').value = 'a dog park, a wetland';
    document.querySelector('#creator textarea[name=guidance]').value = 'One idea per reply.';
    document.querySelector('#creator > button').click();
  `);
  await page.waitFor("document.querySelectorAll('pre.artifact').length === 2");
  const blocks = await page.eval("[...document.querySelectorAll('pre.artifact')].map((p) => p.textContent)");
  const question = JSON.parse(blocks[0]);
  ok(question.schema === "anecdote.poll/v1" && question.pile === "parks-2026" && question.poll === "north-meadow",
     "the pile-side carry block is the anecdote.poll/v1 object");
  ok(question.options.join("|") === "a dog park|a wetland", "options are carried as suggestions");
  const titles = await page.eval("[...document.querySelectorAll('#creator h3')].map((h) => h.textContent).join(' ')");
  ok(titles.includes("_data/constitutions/parks-2026/north-meadow.json"),
     "the Tell-side carry block names its destination path");
  const vault = JSON.parse(await page.eval("localStorage.getItem('floor.questions')"));
  ok(vault.length === 1 && vault[0].poll === "north-meadow", "the question landed in this name's own vault");

  // The viewer: one stage, aimed at vanilla Tell by display params — never a credential.
  await page.waitFor("document.getElementById('viewer').style.display === 'flex'");
  const row = await page.eval("document.querySelector('#panel button').textContent");
  ok(row === "north-meadow — What should the north meadow become?", "the panel lists the question");
  const src = await page.eval("document.getElementById('stage').src");
  ok(src.startsWith("https://tell.anecdote.channel/?pile=parks-2026&poll=north-meadow"),
     "the stage aims at vanilla Tell, puppeted by display params");
  ok(src.includes("q=What%20should%20the%20north%20meadow%20become%3F") && src.includes("opts=a%20dog%20park%2Ca%20wetland"),
     "question and options ride as display params, QR-style");
  ok(!/[?&](tok|post|su)=/.test(src), "no tok, no post, no su — the Floor holds no credential");

  // Persistence: the vault survives reload; the heading flips to "add another".
  await page.goto("https://parks-2026.tell.anecdote.channel/");
  await page.waitFor("document.getElementById('viewer').style.display === 'flex'");
  ok((await page.eval("document.getElementById('creator-heading').textContent")) === "Add another question",
     "the vault persists — a reload reopens the pile's room");

  // Hermetic origins: a different made-up name is a DIFFERENT vault, empty.
  await page.goto("https://quiet-creek.tell.anecdote.channel/");
  await page.waitFor("document.getElementById('creator').style.display === 'block'");
  ok(await page.eval("localStorage.getItem('floor.questions')") === null,
     "a second name carves a second, empty vault — origins are hermetic");
  // The owner's paste brings a pile's questions into the room.
  await page.eval(`
    document.querySelector('#import textarea').value = JSON.stringify([
      { schema: 'anecdote.poll/v1', poll: 'bridge-repair', text: 'Which bridge first?' },
      { schema: 'anecdote.poll/v1', poll: 'quiet-hours', text: 'When should quiet hours start?' },
    ]);
    document.querySelector('#import button').click();
  `);
  await page.waitFor("document.querySelectorAll('#panel button').length === 2");
  ok(JSON.parse(await page.eval("localStorage.getItem('floor.questions')")).length === 2,
     "an owner's paste imports into the vault (merge by slug)");

  // The adapter role: a /storage/.<adapter> path on the same template. With the platform pin an
  // empty slot (the committed default), the adapter names its engine and reaches for NOTHING.
  await page.goto("https://parks-2026.tell.anecdote.channel/storage/.git");
  const adapterNotice = await page.waitFor("((document.getElementById('notice')||{}).textContent||'').includes('storage adapter') && document.getElementById('notice').textContent");
  ok(adapterNotice.includes("git.bottles.anecdote.channel"), "the adapter names its canonical engine bottle");
  ok(adapterNotice.includes("bootstrap not wired"), "with no pin the seam is null — the adapter is inert");
  ok(!page.requests.some((r) => r.url.includes("git.bottles.anecdote.channel")),
     "nothing was fetched from the engine bottle — the safe default holds");

  // The network stayed home: floor origins and the fixed Tell stage, nothing else.
  const hosts = [...new Set(page.requests.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).hostname))];
  ok(hosts.every((h) => h.endsWith("tell.anecdote.channel")),
     "every request stayed on the floor's own names + vanilla Tell: " + hosts.join(", "));
  ok(server.foreign.length === 0, "no request escaped to any host the test did not stand up");
});

if (!ran) { console.log("skip: could not bind 443 for the tls transport (root/CAP_NET_BIND_SERVICE, or sysctl net.ipv4.ip_unprivileged_port_start=443)"); process.exit(0); }
if (fails) { console.error(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall floor UI tests passed (the real template, real wildcard names, real https)");
