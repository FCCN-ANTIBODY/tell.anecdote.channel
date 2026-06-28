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
// Option links carry real hrefs; the write-in "Compose reply" link starts at href="#", so
// filter those out to count true option links.
const links = [...el.innerHTML.matchAll(/href="([^"]+)"/g)].filter((h) => h[1] !== "#");
assert(links.length === 3, "expected 3 option links, got " + links.length);
// type=open also offers a write-in field alongside the suggested options.
assert(/<textarea/.test(el.innerHTML), "open poll: expected a write-in textarea beside options");

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

// --- Write-in / custom-entry rendering -------------------------------------------------
// Re-run the page under a fresh location and return the rendered HTML.
function render(search) {
  const e = { innerHTML: "" };
  globalThis.document = { getElementById: () => e };
  globalThis.location = { search, hash: "" };
  globalThis.window = globalThis;
  eval(script);
  return e.innerHTML;
}
const realLinks = (html) => [...html.matchAll(/href="([^"]+)"/g)].filter((h) => h[1] !== "#");

// Open poll with no fixed options → a write-in textarea, no option links, and the link-builder
// still produces a valid issue URL carrying the typed answer.
const openHtml = render("?pile=p&poll=open1&round=1&tok=t&type=open&q=" + encodeURIComponent("Why?"));
assert(/<textarea/.test(openHtml), "open poll: no write-in textarea");
assert(realLinks(openHtml).length === 0, "open poll with no opts should have no option links");
const typed = JSON.parse(
  new URL(window.tellIssueUrl("A free-form reply")).searchParams.get("body").match(/```tell\n([\s\S]*?)\n```/)[1]
);
assert(typed.answer === "A free-form reply" && typed.type === "open",
  "typed answer block wrong: " + JSON.stringify(typed));

// multichoice → option links only, no write-in field.
const mcHtml = render("?pile=p&poll=mc&round=1&tok=t&type=multichoice&opts=Yes,No");
assert(!/<textarea/.test(mcHtml), "multichoice should not show a write-in textarea");
assert(realLinks(mcHtml).length === 2, "multichoice should render 2 option links");

// multichoice that opts into write-in → both option links and a textarea.
const mcW = render("?pile=p&poll=mc&round=1&tok=t&type=multichoice&writein=1&opts=Yes,No");
assert(/<textarea/.test(mcW), "multichoice+writein should show a textarea");
assert(realLinks(mcW).length === 2, "multichoice+writein should still render 2 option links");

// No type, no opts → still answerable: a write-in field, never a fabricated yes/no.
const bareHtml = render("?pile=p&poll=bare&round=1&tok=t");
assert(/<textarea/.test(bareHtml), "bare poll should fall back to a write-in field");
assert(!/>Yes<|>No</.test(bareHtml), "bare poll must not fabricate yes/no options");

// --- Provenance: a signed QR carries its exact payload into the submission ------------
const blockFor = (search, ans) => {
  render(search);
  return JSON.parse(
    new URL(window.tellIssueUrl(ans)).searchParams.get("body").match(/```tell\n([\s\S]*?)\n```/)[1]
  );
};
// A signed QR (cfg.sig present) carries the exact query verbatim as `qr`, so the Tell can
// verify the poll's signature before processing.
const signedSearch = "?pile=p&poll=mc&round=1&tok=t&type=multichoice&opts=Yes,No&sig=SIGVAL&kid=SHA256%3Aabc";
const sBlock = blockFor(signedSearch, "Yes");
assert(sBlock.qr === signedSearch.slice(1), "signed QR not carried verbatim as qr: " + sBlock.qr);
// An unsigned QR carries no qr field (keeps the body lean; nothing to verify).
const uBlock = blockFor("?pile=p&poll=mc&round=1&tok=t&type=multichoice&opts=Yes,No", "Yes");
assert(!("qr" in uBlock), "unsigned submission must not carry a qr field");

console.log("landing link-builder: OK");
