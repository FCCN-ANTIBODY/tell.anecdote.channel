// Unit-test the Floor (anecdote.channel#93): the alias rule, the question
// switcher's iframe link, the creator's drafted artifacts, and the
// floor-gateway worker. The invariants under test:
//   (a) the hostname's leading label IS the pile name — one label, pile-slug
//       charset, DNS-label length; anything else is not a named Floor;
//   (b) the iframe src is vanilla Tell puppeted by display params ONLY — no
//       tok, no post, no su can ever appear (the Floor can't mint or hold one);
//   (c) the gateway serves the SAME bytes on any name (hostname never selects
//       content), from this repo's own /floor/* on the Pages origin, and 404s
//       everything outside the template's files;
//   (d) drafted artifacts land where the custody model says they go.
import { floorName, pileAddress, questionsFor, tellSrc, draftArtifacts } from "../floor/floor.mjs";
import worker from "../workers/floor-gateway/worker.js";

function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

// (a) the alias rule
assert(floorName("some-pile-name.tell.anecdote.channel") === "some-pile-name", "leaf label not taken as the pile name");
assert(pileAddress("some-pile-name") === "anecdote://data/some-pile-name", "colloquial pile address wrong");
for (const notAFloor of [
  "tell.anecdote.channel",                      // the mother host is the template, not a name
  "a.b.tell.anecdote.channel",                  // exactly one label deep
  "Some-Pile.tell.anecdote.channel",            // pile-slug charset (bin/pile-new's rule)
  "-bad.tell.anecdote.channel",
  "x".repeat(64) + ".tell.anecdote.channel",    // DNS label bound
  "anecdote.channel",
  "localhost",
  "",
]) {
  assert(floorName(notAFloor) === null, "accepted a non-alias hostname: " + notAFloor);
}

// (b) the switcher's iframe link — display params only, ordered like bin/qr
const q = {
  pile: "some-pile-name", poll: "budget", type: "multichoice",
  text: "Cut or keep?", options: ["Cut", "Keep"], guidance: "Be kind",
  accept_writein: true, lifecycle: { round: 2 },
};
const src = tellSrc(q);
assert(
  src === "https://tell.anecdote.channel/?pile=some-pile-name&poll=budget&round=2&type=multichoice&q=Cut%20or%20keep%3F&opts=Cut%2CKeep&guidance=Be%20kind",
  "iframe src wrong: " + src,
);
assert(!/(^|[?&])(tok|post|su)=/.test(src), "a credential-shaped param leaked into the iframe src");
const bare = tellSrc({ pile: "p", poll: "q", text: "T?" });
assert(bare === "https://tell.anecdote.channel/?pile=p&poll=q&q=T%3F", "optional params not omitted cleanly: " + bare);

// questions = the pile's poll slugs out of polls.json
const polls = [
  { pile: "some-pile-name", poll: "budget", text: "Cut or keep?" },
  { pile: "other", poll: "budget", text: "Not ours" },
  { pile: "some-pile-name", poll: 7, text: "bad slug type" },
  { pile: "some-pile-name", poll: "parks", text: "More parks?" },
  null,
];
const mine = questionsFor(polls, "some-pile-name");
assert(mine.length === 2 && mine[0].poll === "budget" && mine[1].poll === "parks", "pile filter wrong");
assert(questionsFor("not-an-array", "x").length === 0, "non-array polls not tolerated");

// (d) creator artifacts — Tell constitution path, pile-side poll object, handshake stanza
const drafted = draftArtifacts("some-pile-name", {
  poll: "budget", text: "Cut or keep?", type: "multichoice",
  options: [" Cut ", "Keep", ""], guidance: "g", scope: "colorado", repo_url: "https://github.com/x/y",
});
assert(drafted.constitutionPath === "_data/constitutions/some-pile-name/budget.json", "constitution path wrong");
assert(drafted.constitution.accept_writein === true, "a drafted constitution must never close the write-in door");
assert(drafted.constitution.options.join(",") === "Cut,Keep", "options not trimmed/filtered");
assert(drafted.pollObject.schema === "anecdote.poll/v1", "poll object schema wrong");
assert(drafted.pollObject.tell === "https://tell.anecdote.channel", "poll object must name its addressable Tell");
assert(drafted.handshake.feed === "feed/colorado/some-pile-name", "handshake feed branch wrong");
assert(drafted.handshake.age_recipient.startsWith("<age1"), "handshake must NOT mint a recipient — owner's device does");

// (c) the gateway worker
const calls = [];
globalThis.fetch = async (input) => {
  calls.push(String(input));
  const body = String(input).endsWith("index.html") ? "<!doctype html>floor" : "// module";
  return new Response(body, { status: 200 });
};
const req = (host, path, method = "GET") => new Request("https://" + host + path, { method });

let r = await worker.fetch(req("some-pile-name.tell.anecdote.channel", "/"));
assert(r.status === 200 && (await r.text()).includes("floor"), "root did not serve the template");
assert(calls[0] === "https://tell.anecdote.channel/floor/index.html", "template not fetched from the mother origin: " + calls[0]);

// same bytes on ANY name: the upstream fetch is identical for two different labels
calls.length = 0;
await worker.fetch(req("aaa.tell.anecdote.channel", "/floor.mjs"));
await worker.fetch(req("zzz.tell.anecdote.channel", "/floor.mjs"));
assert(calls[0] === calls[1] && calls[0] === "https://tell.anecdote.channel/floor/floor.mjs",
  "hostname influenced content selection: " + calls.join(" vs "));

r = await worker.fetch(req("a.tell.anecdote.channel", "/sw.js"));
assert(r.headers.get("Cache-Control") === "no-cache", "sw.js must stay out of edge caches");
assert(r.headers.get("Content-Type").startsWith("text/javascript"), "sw.js content type wrong");

// blank slate means blank: nothing else is served, and no proxying of the mother site
for (const path of ["/polls.json", "/piles/x/feed/manifest.json", "/submit", "/anything", "/floor/index.html"]) {
  r = await worker.fetch(req("a.tell.anecdote.channel", path));
  assert(r.status === 404, "served a non-template path: " + path);
}
r = await worker.fetch(req("a.tell.anecdote.channel", "/", "POST"));
assert(r.status === 405, "non-GET not refused");

console.log("ok: floor — label is the pile name, iframe carries no credential, gateway is name-blind and blank");
