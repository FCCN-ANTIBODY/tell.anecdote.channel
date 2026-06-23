---
layout: default
title: null
---

# Tell

**Tell** carries one reply back. When a poll is posed, its **QR code** opens Tell on this bare
domain with the poll's configuration riding in the link — Tell reads that configuration and (soon)
walks you through a single, consented response, then routes it to a **data-pile that
[Atlas](https://atlas.anecdote.channel) reflects**. No reply is composed or sent yet; this is the
landing the QR lands on.

<section id="tell-config" class="tell-config" aria-live="polite">
  <noscript>Open Tell from a poll's QR code; the link carries the poll configuration.</noscript>
</section>

<p class="tell-note">
  Nothing here phones home. Tell is dormant until a poll's QR places its configuration in the
  link above and you choose to reply.
</p>

<script>
(function () {
  "use strict";
  // Dormant config readout: parse the poll configuration the QR encoded into the link
  // (query string and/or hash). No network, no timers, no event loop — it runs once and
  // only reflects what is already in the URL.
  var mount = document.getElementById("tell-config");
  if (!mount) return;

  function collect(source) {
    var out = {};
    try {
      new URLSearchParams(source).forEach(function (v, k) { out[k] = v; });
    } catch (e) {}
    return out;
  }

  var hash = (location.hash || "").replace(/^#/, "");
  var cfg = collect(location.search);
  var fromHash = collect(hash);
  for (var k in fromHash) { if (!(k in cfg)) cfg[k] = fromHash[k]; }

  var keys = Object.keys(cfg);
  if (keys.length === 0) {
    mount.innerHTML =
      '<p class="tell-empty">No poll loaded — open Tell from a poll’s QR code.</p>';
    return;
  }

  var rows = keys.map(function (k) {
    var key = String(k).replace(/[<&>]/g, "");
    var val = String(cfg[k]).replace(/[<&>]/g, "");
    return '<div class="tell-row"><span class="tell-k">' + key +
           '</span><span class="tell-v">' + val + "</span></div>";
  }).join("");

  mount.innerHTML =
    '<p class="tell-loaded">Poll configuration detected (dormant):</p>' +
    '<div class="tell-grid">' + rows + "</div>";
})();
</script>
