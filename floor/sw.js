// The Floor's service worker — the smallest job that keeps the blank slate
// available offline, on purpose.
//
// anecdote.channel#92 asks what a service worker's minimum UNPROMPTED job is
// once "the queen only acts when visited" is the rule. This one is written to
// that floor (pun intended):
//
//   * install: precache the shell — the page + floor.mjs, plus the storage
//     -adapter consumer bootstrap (pin + adapter/*.mjs) so an adapter load is
//     offline-whole too. Still the whole unprompted job; still no fetches of
//     its own (the adapter's one outward surface is the iframe, cross-origin,
//     which this sw never touches).
//   * activate: drop superseded floor-shell-* caches.
//   * fetch: cache-first for the shell, same-origin GETs only. It NEVER
//     intercepts cross-origin traffic — the iframe to vanilla Tell passes it
//     untouched (and the page itself fetches nothing at all).
//
// No firmware pin, no message channel, no background sync, no push. The pin
// machinery (anecdote sw.js checkFirmware) guards an origin that executes
// privileged ops; the Floor executes none — richer capability only ever
// arrives iframed-in as a guest (the dumb-shell/control-center split). If the
// Floor ever grows privileged ops, it inherits the pin, not the other way
// around.
//
// Paths are RELATIVE to the registration scope so the same bytes serve both
// placements: /floor/ on the mother host, / on the canonical Floor site the
// wildcard names mask onto.

const VERSION = "floor-shell-v3";
const SHELL = [
  "./",
  "./floor.mjs",
  "./adapter/platform-key.mjs",
  "./adapter/open-seam.mjs",
  "./adapter/open-engine.mjs",
  "./adapter/install.mjs",
  "./adapter/install-loader.mjs",
  "./adapter/bottle-uri.mjs",
  "./adapter/sign.mjs",
  "./adapter/anecdote.mjs",
  "./adapter/probe-client.mjs",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("floor-shell-") && k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // never touch the iframe / mother host
  e.respondWith(
    (async () => {
      // Navigations collapse onto the shell root (there is only one page).
      const cached = await caches.match(req.mode === "navigate" ? "./" : req);
      if (cached) return cached;
      return fetch(req);
    })(),
  );
});
