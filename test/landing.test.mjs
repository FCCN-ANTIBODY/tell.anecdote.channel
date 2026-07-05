// Unit-test index.md's FORWARD: the landing no longer composes replies (anecdote.channel does now — see
// docs/answer-runtime.md). Given a poll QR in the URL, the page must redirect to anecdote's answer runtime
// carrying the query VERBATIM (so a signed poll's provenance survives byte-for-byte); with no poll it shows
// the empty state and does not redirect. The byte-parity of the submission itself is guarded on the
// anecdote side (composer/poll-answer.test.mjs).
import fs from "fs";

const root = new URL("..", import.meta.url).pathname;
const md = fs.readFileSync(root + "index.md", "utf8");
const script = md.match(/<script>([\s\S]*?)<\/script>/)[1];

const RUNTIME = "https://anecdote.channel/poll.html";
function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

// Run the page script under minimal DOM/location stubs; capture any location.replace target.
function run(search, hash = "") {
  const el = { innerHTML: "" };
  let replaced = null;
  globalThis.document = { getElementById: () => el };
  globalThis.location = { search, hash, replace: (u) => { replaced = u; } };
  globalThis.window = globalThis;
  globalThis.URLSearchParams = URLSearchParams;
  eval(script);
  return { html: el.innerHTML, replaced };
}

// 1. A loaded poll forwards to anecdote's runtime with the query verbatim.
{
  const raw = "pile=cd04-q1&poll=bikes&round=3&type=open&tok=deadbeef&q=Expand%20bike%20lanes%3F&opts=Yes%2CNo";
  const { html, replaced } = run("?" + raw);
  assert(replaced === RUNTIME + "?" + raw, "did not forward verbatim to the runtime: " + replaced);
  assert(/Continue to anecdote\.channel/.test(html), "no manual Continue link for the no-JS-redirect fallback");
}

// 2. The query is forwarded byte-for-byte (a signed poll's sig must not be re-encoded).
{
  const raw = "pile=p&poll=q&round=1&tok=t&sig=Zm9vYmFy%2Bb2F%3D&kid=SHA256%3Aabc";
  const { replaced } = run("?" + raw);
  assert(replaced === RUNTIME + "?" + raw, "signed query was altered in transit: " + replaced);
}

// 3. Hash-carried params are forwarded too (a search-less QR).
{
  const { replaced } = run("", "#pile=p&poll=q&round=1&tok=t");
  assert(replaced === RUNTIME + "?pile=p&poll=q&round=1&tok=t", "hash params not forwarded: " + replaced);
}

// 4. No poll → empty state, and NO redirect.
{
  const { html, replaced } = run("?poll=q");   // missing pile/round/tok
  assert(replaced === null, "redirected without a full poll token");
  assert(/No poll loaded/.test(html), "missing empty state");
}

// 5. A self-naming question WITHOUT a token → preview mode (the Floor's iframe branch,
//    #93's free fall-through), and NO redirect. Display fields render escaped.
{
  const raw = "pile=cd04-q1&poll=bikes&round=1&q=Expand%20%3Cbike%3E%20lanes%3F&opts=Yes%2CNo&guidance=Be%20kind";
  const { html, replaced } = run("?" + raw);
  assert(replaced === null, "preview redirected without a token");
  assert(/Preview — no live token/.test(html), "missing the preview banner");
  assert(html.includes("Expand &lt;bike&gt; lanes?"), "question not rendered escaped: " + html);
  assert(/<li>Yes<\/li>/.test(html) && /<li>No<\/li>/.test(html), "options not listed");
  assert(/Be kind/.test(html), "guidance not shown");
  assert(!/No poll loaded/.test(html), "preview fell through to the empty state");
}

// 6. tok present but round missing → still NOT a forward, and only a preview if it self-names.
{
  const { html, replaced } = run("?pile=p&poll=q&tok=t");
  assert(replaced === null, "forwarded an incomplete token set");
  assert(/No poll loaded/.test(html), "tokless partial did not show the empty state");
}

console.log("landing forward test passed");
