// Unit-test index.md's link-builder: given a QR config in the URL, it must render the
// options and build a GitHub issues/new URL whose body carries a parseable ```tell```
// block with the right fields. Runs the page script under minimal DOM/location stubs.
import fs from "fs";

const root = new URL("..", import.meta.url).pathname;
const md = fs.readFileSync(root + "index.md", "utf8");
const script = md.match(/<script>([\s\S]*?)<\/script>/)[1];

const el = { innerHTML: "" };
globalThis.document = { getElementById: () => el };
globalThis.location = {
  search:
    "?pile=cd04-q1&poll=bikes&round=3&type=open&asker=" + encodeURIComponent("dot-office") +
    "&guidance=" + encodeURIComponent("one option; no essays") +
    "&tok=deadbeef&q=" + encodeURIComponent("Expand bike lanes?") +
    "&opts=" + encodeURIComponent("Yes,No,Study"),
  hash: "",
};
globalThis.window = globalThis;

eval(script);

function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

assert(/Expand bike lanes/.test(el.innerHTML), "question not rendered");
const links = [...el.innerHTML.matchAll(/href="([^"]+)"/g)];
assert(links.length === 3, "expected 3 option links, got " + links.length);

const u = new URL(window.tellIssueUrl("Study"));
assert(u.pathname.endsWith("/issues/new"), "not an issues/new url: " + u.pathname);
// No &repo in this config → addresses the canonical Tell repo.
assert(u.host === "github.com" && u.pathname === "/FCCN-ANTIBODY/tell.anecdote.channel/issues/new",
  "default repo addressing wrong: " + u.pathname);
assert(u.searchParams.get("labels") === "tell-submission", "missing tell-submission label");
const body = u.searchParams.get("body");
const block = body.match(/```tell\n([\s\S]*?)\n```/);
assert(block, "no fenced tell block in body");
const obj = JSON.parse(block[1]);
assert(
  obj.schema === "tell.submission/v1" &&
  obj.pile === "cd04-q1" && obj.poll === "bikes" && obj.round === "3" &&
  obj.type === "open" && obj.asker === "dot-office" &&
  obj.shown_guidance === "one option; no essays" &&
  obj.tok === "deadbeef" && obj.answer === "Study",
  "tell block fields wrong: " + JSON.stringify(obj)
);
// Re-run the page script under a fresh location to exercise &repo addressing.
function issueHostPath(search) {
  const e = { innerHTML: "" };
  globalThis.document = { getElementById: () => e };
  globalThis.location = { search, hash: "" };
  globalThis.window = globalThis;
  eval(script);
  const x = new URL(window.tellIssueUrl("Yes"));
  return x.host + x.pathname;
}
const base = "?pile=p&poll=q&round=1&tok=t&opts=Yes,No";
// A clean OWNER/NAME addresses that jurisdiction Tell.
assert(issueHostPath(base + "&repo=" + encodeURIComponent("acme/tell.fort-collins")) ===
  "github.com/acme/tell.fort-collins/issues/new", "custom repo not addressed");
// A malformed repo (path traversal / extra segments / scheme) falls back to canonical.
for (const bad of ["evil.com/a/b", "a", "../../x", "https://evil/x"]) {
  assert(issueHostPath(base + "&repo=" + encodeURIComponent(bad)) ===
    "github.com/FCCN-ANTIBODY/tell.anecdote.channel/issues/new", "bad repo not rejected: " + bad);
}
console.log("landing link-builder: OK");
