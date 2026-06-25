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
    "?pile=cd04-q1&round=3&tok=deadbeef&q=" +
    encodeURIComponent("Expand bike lanes?") +
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
assert(u.searchParams.get("labels") === "tell-submission", "missing tell-submission label");
const body = u.searchParams.get("body");
const block = body.match(/```tell\n([\s\S]*?)\n```/);
assert(block, "no fenced tell block in body");
const obj = JSON.parse(block[1]);
assert(
  obj.schema === "tell.submission/v0" &&
  obj.pile === "cd04-q1" && obj.round === "3" &&
  obj.tok === "deadbeef" && obj.answer === "Study",
  "tell block fields wrong: " + JSON.stringify(obj)
);
console.log("landing link-builder: OK");
