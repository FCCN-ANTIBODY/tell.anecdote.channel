// Unit: the sealed credential — the worker holds one secret and zero tokens. Seal/unseal
// round-trips; a tampered or foreign cipher is noise; the worker vets the BINDING before the
// token is ever used; the legacy single-token path is untouched; nothing ever echoes.
import { seal, unseal, mintKey } from "../workers/submit-gateway/seal.mjs";
import worker from "../workers/submit-gateway/worker.js";

function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

const KEY = mintKey();
const binding = { token: "ghp_asker", repo: "someone/their-poll", issue: "7", pile: "boardgames", poll: "night", minted_at: "2026-07-05T00:00:00Z" };
const sc = await seal(binding, KEY);
assert(sc.startsWith("sc1."), "wire form");
assert(JSON.stringify(await unseal(sc, KEY)) === JSON.stringify(binding), "seal round-trips its binding");
assert((await unseal(sc.slice(0, -2) + "AA", KEY)) === null, "a tampered cipher is noise");
assert((await unseal(sc, mintKey())) === null, "another Tell's key opens nothing — no global unwrapping point");

const calls = [];
globalThis.fetch = async (input, init) => {
  calls.push({ input, init });
  return new Response(JSON.stringify({ html_url: "https://github.com/x", id: 1, number: 7 }), { status: 201 });
};
const ENV = { TELL_POST_TOKEN: "ghp_tell", TELL_SEAL_KEY: KEY };
const post = (body) => worker.fetch(new Request("https://tell.anecdote.channel/submit", { method: "POST", body: JSON.stringify(body) }), ENV);

// sealed path: exact bound issue only, inner token header-only
const GOOD = "/repos/someone/their-poll/issues/7/comments";
let r = await post({ path: GOOD, body: { body: "c" }, sc });
assert(r.status === 201, "sealed relay reaches the bound issue");
let gh = calls.pop();
assert(gh.init.headers.Authorization === "Bearer ghp_asker", "the ASKER'S token acted, header-only");
for (const bad of ["/repos/someone/their-poll/issues/8/comments", "/repos/someone/their-poll/issues", "/repos/FCCN-ANTIBODY/tell.anecdote.channel/issues"]) {
  r = await post({ path: bad, body: {}, sc });
  assert(r.status === 403, "binding mismatch not refused: " + bad);
}
r = await post({ path: GOOD, body: {}, sc: "sc1.garbage.garbage" });
assert(r.status === 400, "an unopenable cipher not refused");
r = await worker.fetch(new Request("https://tell.anecdote.channel/submit", { method: "POST", body: JSON.stringify({ path: GOOD, body: {}, sc }) }), { TELL_POST_TOKEN: "x" });
assert(r.status === 503, "sealed path without a seal key fails closed");

// legacy path unchanged; nothing echoes
calls.length = 0;
r = await post({ path: "/repos/FCCN-ANTIBODY/tell.anecdote.channel/issues", body: { title: "t" } });
assert(r.status === 201 && calls[0].init.headers.Authorization === "Bearer ghp_tell", "the canonical Tell's own path is untouched");
const out = await (await post({ path: GOOD, body: {}, sc })).text();
assert(!out.includes("ghp_asker") && !out.includes(KEY), "neither token nor key ever echoes");

console.log("ok: sealed credential — one secret, zero tokens; binding vetted before the token acts");
