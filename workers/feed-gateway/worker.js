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
//
// The Worker is NOT load-bearing: a pile can pull the same files from
// raw.githubusercontent.com (its source `url` is configurable) and trust comes from the
// signed manifest, not this transport. It is kept as the POLICY SEAM — the one centralized
// place a Tell can read its own attested metadata and tag/police a pickup. It already does
// the cheapest form: on the manifest (the thin head), it lifts the coarse, signed
// `vouch` summary bin/deliver promoted into each entry and stamps it as `X-Tell-Vouch`, so
// an edge cache rule or an Atlas can read a block's location/source confidence WITHOUT
// decrypting. The heavy *.enc blocks are content-addressed and immutable — they get a long
// cache and no policy logic ever touches them, so this cost scales with manifests, not
// traffic. A richer worker (gradient/confidence gates, per-Tell strictness) reads the same
// signed field later — the header is just its convenience projection.

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

// Compact the head block's COARSE voucher summary (the signed `entries[].vouch` bin/deliver
// promoted) into one header line, e.g.
//   seq=4; loc=state:3,county:1; loc_conf=0-0.7; src=sensor:2,asserted:2; src_conf=0-0.7
// Strictly a projection of the signed manifest — never a new source of truth, and never a
// location value (the summary carries only gradient histograms + confidence ranges).
function vouchHeader(manifest) {
  const entries = Array.isArray(manifest && manifest.entries) ? manifest.entries : [];
  const head = entries[entries.length - 1];
  const v = head && head.vouch;
  if (!v) return null;
  const hist = (o) => Object.entries(o || {}).map(([k, n]) => `${k}:${n}`).join(",") || "none";
  const range = (lo, hi) => `${lo == null ? 0 : lo}-${hi == null ? 0 : hi}`;
  return [
    `seq=${head.seq}`,
    `loc=${hist(v.location && v.location.gradients)}`,
    `loc_conf=${range(v.location && v.location.min_confidence, v.location && v.location.max_confidence)}`,
    `src=${hist(v.source && v.source.kinds)}`,
    `src_conf=${range(v.source && v.source.min_confidence, v.source && v.source.max_confidence)}`,
  ].join("; ");
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
    // Content-addressed *.enc / *.age blocks never change → cache them hard (the immutable
    // bulk). The thin head (manifest.json) stays short-lived; it is the only surface any
    // policy/voucher logic touches, so cost scales with manifests, not payload traffic.
    const isBlock = /\.(enc|age)$/.test(file);
    headers.set(
      "Cache-Control",
      isBlock ? "public, max-age=31536000, immutable" : `public, max-age=${CACHE_TTL}`,
    );
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Tell-Gateway", "feed");

    // On the head, stamp the coarse, signed voucher summary so an edge rule or an Atlas can
    // read a block's location/source confidence without decrypting. Best-effort: a parse
    // failure leaves the header unset and the signed manifest body untouched.
    if (file.endsWith("manifest.json")) {
      try {
        const tag = vouchHeader(await placed.clone().json());
        if (tag) headers.set("X-Tell-Vouch", tag);
      } catch (_) {
        /* no header; pickup is unaffected */
      }
    }

    return new Response(placed.body, { status: placed.status, headers });
  },
};
