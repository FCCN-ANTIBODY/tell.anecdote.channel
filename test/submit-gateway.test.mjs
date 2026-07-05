// Unit-test the submit-gateway worker: a PURE RELAY that shields TELL_POST_TOKEN. The worker
// must (a) pass through anything that isn't POST /submit, (b) refuse to run unprovisioned,
// (c) allowlist exactly the one repo's canonical-issue COMMENT paths — mode=issue is retired,
// so the bare /issues (new issue) path is refused like any other, (d) inject the credential
// HEADER-ONLY and relay the body verbatim, (e) project the upstream response without ever
// echoing the credential. No admission logic lives here — that stays in bin/authz.
import worker from "../workers/submit-gateway/worker.js";

function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

const calls = [];
globalThis.fetch = async (input, init) => {
  calls.push({ input, init });
  if (typeof input !== "string") return new Response("origin", { status: 200 }); // passthrough probe
  return new Response(JSON.stringify({ html_url: "https://github.com/x/y/issues/9", id: 1, number: 9, message: "ok" }), { status: 201 });
};

const ENV = { TELL_POST_TOKEN: "ghp_secret" };
const req = (method, path, body, extra = {}) =>
  new Request("https://tell.anecdote.channel" + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...extra,
  });

// (a) not ours → passthrough to origin, untouched
let r = await worker.fetch(req("GET", "/piles/x/feed/manifest.json"), ENV);
assert(r.status === 200 && (await r.text()) === "origin", "non-/submit did not pass through");

// preflight
r = await worker.fetch(req("OPTIONS", "/submit"), ENV);
assert(r.status === 204 && r.headers.get("Access-Control-Allow-Methods").includes("POST"), "OPTIONS preflight");

// method + provisioning guards
r = await worker.fetch(req("GET", "/submit"), ENV);
assert(r.status === 405, "GET /submit not refused");
r = await worker.fetch(req("POST", "/submit", { path: "/x", body: {} }), {});
assert(r.status === 503, "unprovisioned relay did not 503");

// (c) path allowlist — exactly this repo's canonical-issue comment threads. The bare issues
// (new issue) path is the RETIRED mode=issue surface: refused, not relayed. The issueUrl
// fallback never touches the relay — the respondent's own click is the authority there.
const ISSUES = "/repos/FCCN-ANTIBODY/tell.anecdote.channel/issues";
const GOOD = ISSUES + "/9/comments";
for (const bad of [
  ISSUES,                                                          // new-issue: retired with mode=issue
  "/repos/FCCN-ANTIBODY/other-repo/issues/9/comments",
  "/repos/FCCN-ANTIBODY/tell.anecdote.channel/pulls",
  "/repos/FCCN-ANTIBODY/tell.anecdote.channel/issues/9/comments/1",
  "/user",
  ISSUES + "/../../../user",
]) {
  r = await worker.fetch(req("POST", "/submit", { path: bad, body: {} }), ENV);
  assert(r.status === 403, "allowed a disallowed path: " + bad);
}
r = await worker.fetch(req("POST", "/submit", { path: "nope" }), ENV);
assert(r.status === 403, "non-string-ish path not refused");
r = await worker.fetch(new Request("https://tell.anecdote.channel/submit", { method: "POST", body: "{not json" }), ENV);
assert(r.status === 400, "non-JSON body not refused");

// (d) the relay itself — a comment onto the canonical poll issue (the one paradigm)
calls.length = 0;
const block = { body: "```tell\n{...}\n```" };
r = await worker.fetch(req("POST", "/submit", { path: GOOD, body: block }), ENV);
assert(r.status === 201, "good relay did not return upstream status");
let gh = calls.find((c) => typeof c.input === "string" && c.input.startsWith("https://api.github.com"));
assert(gh && gh.input === "https://api.github.com" + GOOD, "did not call the GitHub API path verbatim");
assert(gh.init.headers.Authorization === "Bearer ghp_secret", "credential not injected header-only");
assert(gh.init.body === JSON.stringify(block), "body not relayed verbatim");

// (e) projection: html_url surfaces, the credential never does
const out = await (await worker.fetch(req("POST", "/submit", { path: GOOD, body: block }), ENV)).text();
assert(out.includes("html_url"), "projection lost html_url");
assert(!out.includes("ghp_secret"), "credential leaked into the response");

console.log("ok: submit-gateway relays verbatim, allowlists one repo's comment threads, never leaks the credential");
