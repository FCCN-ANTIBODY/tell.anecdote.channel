---
layout: default
title: null
---

# Tell

**Tell** carries one reply back. A poll's **QR code** opens this page with the poll's configuration riding in
the link. Tell forwards you to **[anecdote.channel](https://anecdote.channel)** — the app that composes your
reply — where you answer the single question and it builds a **pre-filled GitHub issue** addressed to the
data-pile this poll feeds. Your answer is **always yours to write**; any options are only suggestions.
Nothing here phones home: the reply is a GitHub issue you review and submit yourself.

<section id="tell-poll" class="tell-config" aria-live="polite">
  <noscript>Open Tell from a poll's QR code, then continue to anecdote.channel to compose your reply.</noscript>
</section>

<script>
(function () {
  "use strict";
  // The QR was addressed to a Tell from the start — its token binds {pile, poll, round}, and only the
  // minting Tell can verify it. What used to live here (render the question, build the submission) now lives
  // in anecdote, the RUNTIME (see docs/qr-provenance.md and bin/qr's --repo/post notes). This page is a thin
  // FORWARD: it hands the poll's exact query to anecdote's answer view, VERBATIM, so a signed poll's
  // provenance travels byte-for-byte. anecdote.channel is the canonical runtime; a jurisdiction can point
  // its own QRs straight at it. See docs/answer-runtime.md.
  var RUNTIME = "https://anecdote.channel/poll.html";

  var mount = document.getElementById("tell-poll");
  // The exact query, undecoded: search first, hash as the fallback (bin/qr puts params after "?").
  var raw = (location.search || "").replace(/^\?/, "") || (location.hash || "").replace(/^#/, "");
  var p = new URLSearchParams(raw);
  if (!p.get("pile") || !p.get("poll") || !p.get("round") || !p.get("tok")) {
    // No live token -> nothing to forward. But a question that names itself (pile+poll+q,
    // just no tok) is a PREVIEW, not an error: the mode selection issue #93 says is already
    // free. The Floor (<name>.tell.anecdote.channel, docs/floor.md) drives this branch when
    // it iframes vanilla Tell per question — a Floor can never mint a token, only the Tell
    // engine can. Preview renders display fields only; no reply can be composed from here.
    var esc = function (s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    if (p.get("pile") && p.get("poll") && p.get("q")) {
      var opts = (p.get("opts") || "").split(",").filter(function (s) { return s !== ""; });
      var html = '<p class="tell-preview-tag">Preview — no live token rides this link, so no reply can be composed. A live poll’s QR carries its <code>tok</code>.</p>';
      html += '<h2 class="tell-question">' + esc(p.get("q")) + "</h2>";
      if (p.get("guidance")) html += '<p class="tell-guidance">' + esc(p.get("guidance")) + "</p>";
      // The forced law (antidote docs/faces.md, slice 4): when a question rides under a bottle's
      // constitution, show it here so the preview makes the inversion visible — even tokenless, the
      // terms every answer will wear are named. Only a well-formed pointer surfaces.
      var terms = p.get("constitution") || "";
      if (/^sha256:[0-9a-f]{64}$/.test(terms)) {
        html += '<p class="tell-constitution">⚖ answers here wear these terms, inside the signature: <code>' + esc(terms.slice(0, 23)) + "…</code></p>";
      }
      if (opts.length) {
        html += '<ul class="tell-opts">';
        for (var i = 0; i < opts.length; i++) html += "<li>" + esc(opts[i]) + "</li>";
        html += '</ul><p class="tell-empty">Options are only suggestions — a live reply is always yours to write.</p>';
      }
      html += '<p class="tell-empty">' + esc(p.get("pile")) + "/" + esc(p.get("poll")) + "</p>";
      if (mount) mount.innerHTML = html;
      return;
    }
    if (mount) mount.innerHTML = '<p class="tell-empty">No poll loaded — open Tell from a poll’s QR code.</p>';
    return;
  }

  var target = RUNTIME + "?" + raw;                 // forward the query verbatim (no re-encode)
  if (mount) mount.innerHTML =
    '<p class="tell-loaded">Opening anecdote to compose your reply…</p>' +
    '<p><a class="tell-opt" href="' + target.replace(/"/g, "&quot;") + '">Continue to anecdote.channel →</a></p>';
  location.replace(target);
})();
</script>
