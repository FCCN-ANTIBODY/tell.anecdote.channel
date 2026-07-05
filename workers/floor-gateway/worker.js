// Tell floor-gateway Worker.
//
// Serves the Floor (anecdote.channel#93) on ANY <name>.tell.anecdote.channel:
// the same template bytes for every name, fetched from this repo's own Pages
// origin (/floor/* on tell.anecdote.channel). The hostname label is NEVER
// consulted to select content — it only names the origin the browser carves
// out (the storage group of #92's wildcard PSL entry) and, to the Floor page
// itself, the data-pile it stages for (the alias rule: label == pile name).
//
// Blank slate means blank: exactly the template's files are served, everything
// else is 404. This worker must never become a proxy of the mother site under
// foreign names — a Floor origin serves NOTHING but the Floor.
//
// Like the feed-gateway, it is not load-bearing for trust (the template is
// public and inspectable in this repo) and holds NO secrets — no admission, no
// credentials, no per-name state. Provisioning it needs three one-time pieces,
// all documented in docs/floor.md:
//   1. DNS: a proxied (orange-cloud) `*.tell` record on the anecdote.channel zone.
//   2. TLS: `*.tell.anecdote.channel` in anecdote.channel's config/san-list.txt
//      (a TLS wildcard matches one label; `*.anecdote.channel` covers the bare
//      tell host but not names under it).
//   3. This worker on the route below.

const ORIGIN = "https://tell.anecdote.channel"; // the mother host that publishes the template
const CACHE_TTL = 300; // seconds

// The whole served surface. sw.js is no-cache so a shipped fix propagates at
// service-worker update speed instead of living in edge caches.
const FILES = {
  "/": { path: "/floor/index.html", type: "text/html; charset=utf-8" },
  "/index.html": { path: "/floor/index.html", type: "text/html; charset=utf-8" },
  "/floor.mjs": { path: "/floor/floor.mjs", type: "text/javascript; charset=utf-8" },
  "/sw.js": { path: "/floor/sw.js", type: "text/javascript; charset=utf-8" },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const entry = FILES[url.pathname];
    if (!entry) return new Response("Not found", { status: 404 });

    const upstream = await fetch(ORIGIN + entry.path, {
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    if (!upstream.ok) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", entry.type);
    headers.set(
      "Cache-Control",
      url.pathname === "/sw.js" ? "no-cache" : `public, max-age=${CACHE_TTL}`,
    );
    headers.set("X-Tell-Gateway", "floor");
    return new Response(upstream.body, { status: 200, headers });
  },
};
