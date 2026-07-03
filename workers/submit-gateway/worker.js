// Cloudflare Worker: the Tell's SUBMIT GATEWAY — a pure relay that shields the POST credential.
//
//   POST tell.anecdote.channel/submit
//
// The answer runtime (anecdote.channel/poll.html) sends the same GitHub-API-shaped request it
// would have sent to api.github.com — { path, body } — and this worker relays it with the
// Tell's credential injected server-side. The QR then carries only a non-secret address
// (`su=`), never a token: see bin/qr and docs/submission-credential.md.
//
// CUSTODY (this is the constellation's first secret-bearing worker — say it out loud):
//   - env.TELL_POST_TOKEN (via `wrangler secret put TELL_POST_TOKEN`): the same repo-scoped,
//     issues-only fine-grained PAT bin/submit-bootstrap provisions. Per-Tell custody — this
//     worker is the Tell's OWN, holding only its own credential. The rejected central-apex
//     jar (docs/submission-credential.md → "Rejected") stays rejected.
//   - It holds NO TELL_QR_SECRET and performs NO admission. A relay, not a gatekeeper: the
//     credential still only lets a reply KNOCK (create the draft); whether it is ADMITTED is
//     decided at ingest by bin/authz, exactly as before. Do not add judging here — when the
//     summonable judge lands (civic-node OPEN-QUESTIONS §A) the worker SUMMONS it over the
//     {verdict, reason} contract; it never decides itself.
//
// The blast radius of the worker equals the blast radius of the PAT it holds: create issues /
// comments on ONE already-public repo. The path allowlist below is defense in depth on top of
// GitHub's own scope boundary.
//
// Deploy: wrangler deploy && wrangler secret put TELL_POST_TOKEN   (see README.md)

const OWNER = "FCCN-ANTIBODY";
const REPO = "tell.anecdote.channel";
const API = "https://api.github.com";

// POST /repos/OWNER/REPO/issues  |  POST /repos/OWNER/REPO/issues/<n>/comments — nothing else.
const PATH_OK = new RegExp(
  `^/repos/${OWNER}/${REPO}/issues(/[0-9]{1,10}/comments)?$`
);
const MAX_BODY = 64 * 1024; // a submission block is small; a relay stays polite

const CORS = {
  "Access-Control-Allow-Origin": "*", // the reply lands on a public repo; the block is public by design
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function reply(status, obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "X-Tell-Gateway": "submit", ...CORS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/submit") return fetch(request); // not ours — pass through to the origin

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return reply(405, { error: "POST only" });
    if (!env.TELL_POST_TOKEN) {
      return reply(503, { error: "relay not provisioned (wrangler secret put TELL_POST_TOKEN)" });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "body too large" });
    let req;
    try {
      req = JSON.parse(raw);
    } catch {
      return reply(400, { error: "body must be JSON: { path, body }" });
    }
    const path = typeof req.path === "string" ? req.path : "";
    if (!PATH_OK.test(path)) {
      return reply(403, { error: "path not allowed", allowed: PATH_OK.source });
    }
    if (typeof req.body !== "object" || req.body === null) {
      return reply(400, { error: "body.body must be the GitHub request object" });
    }

    // Relay verbatim; inject the credential HEADER-ONLY (the three-token discipline —
    // composer/egress-github.mjs). The worker adds nothing to the payload: the fenced
    // tell block arrives exactly as the runtime built it, so the ingest oracle holds.
    const gh = await fetch(API + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TELL_POST_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": `tell-submit-gateway (${OWNER}/${REPO})`,
      },
      body: JSON.stringify(req.body),
    });

    // Project the response: enough for the respondent to see their reply landed (and where),
    // never the credential, never GitHub's rate headers verbatim.
    let out = {};
    try {
      const j = await gh.json();
      out = { html_url: j.html_url, id: j.id, number: j.number };
      if (!gh.ok) out = { error: j.message || "upstream error" };
    } catch {
      out = gh.ok ? {} : { error: "upstream error" };
    }
    return reply(gh.status, out);
  },
};
