// Tell feed-gateway Worker.
//
// Serves tell.anecdote.channel/piles/<id>/feed/<file> from the pile's encrypted
// chain on Tell's OWN feed/<scope>/<id> branch (under inbox/). The payload is
// age-encrypted and the manifest is signed, so serving it openly (CORS-*, cached)
// leaks nothing — a pile pulls + verifies it. This is the pickup surface: "the same
// party you tell your data to is the party you pick your responses up from."
//
// Resolution:
//   1. parse /piles/<id>/feed/<file> from the request path
//   2. read the rendered manifest (/piles.json on the Pages origin) to map
//      id -> feed branch (the registry _data/piles.yml is the anchor)
//   3. fetch raw <feed>/inbox/<file>, cached, CORS-open
//   4. unknown id / not-yet-delivered -> 404 (no committed seed for feed/*)

const OWNER = "FCCN-ANTIBODY";
const REPO = "tell.anecdote.channel";
const CACHE_TTL = 300; // seconds

const TYPES = {
  json: "application/json; charset=utf-8",
};

function contentType(path) {
  const ext = path.split(".").pop().toLowerCase();
  return TYPES[ext] || "application/octet-stream"; // .enc / .age -> octet-stream
}

async function loadManifest(origin) {
  try {
    const r = await fetch(`${origin}/piles.json`, {
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    return r.ok ? await r.json() : [];
  } catch (_) {
    return [];
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only the feed pickup path is this Worker's concern; everything else hits origin.
    if (!url.pathname.startsWith("/piles/")) return fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // /piles/<id>/feed/<file>
    const rest = url.pathname.slice("/piles/".length);
    const m = rest.match(/^([^/]+)\/feed\/(.+)$/);
    if (!m) return fetch(request);
    const id = m[1];
    const file = m[2];

    const entry = (await loadManifest(url.origin)).find((p) => p.id === id);

    let placed = null;
    if (entry && entry.feed && file) {
      const raw =
        `https://raw.githubusercontent.com/${OWNER}/${REPO}/` +
        `${entry.feed}/inbox/${file}`;
      placed = await fetch(raw, { cf: { cacheTtl: CACHE_TTL, cacheEverything: true } });
    }

    if (!placed || !placed.ok) {
      return new Response("Not found", {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const headers = new Headers(placed.headers);
    headers.set("Content-Type", contentType(url.pathname));
    headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Tell-Gateway", "feed");

    return new Response(placed.body, { status: placed.status, headers });
  },
};
