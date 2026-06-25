---
layout: default
title: null
---

# Tell

**Tell** carries one reply back. A poll's **QR code** opens Tell on this bare domain with the poll's
configuration — and a one-poll authorization token — riding in the link. Tell reads it, shows you the
single question, and (when you choose to) hands you a **pre-filled GitHub issue** addressed to the
data-pile this poll feeds. Nothing here phones home: this page only *builds a link*; submitting it is
your click, and the [Tell engine](CONTRACT.md) seals abiding replies into the pile's encrypted feed.

<section id="tell-poll" class="tell-config" aria-live="polite">
  <noscript>Open Tell from a poll's QR code; the link carries the poll configuration.</noscript>
</section>

<p class="tell-note">
  Your reply posts as a public GitHub issue carrying only your chosen option (plus the poll's token).
  Tell encrypts it to the pile owner and closes the issue; don't put anything private in a reply.
</p>

<script>
(function () {
  "use strict";
  // The Tell repo whose Issues are this poll's mailbox.
  var REPO = "FCCN-ANTIBODY/tell.anecdote.channel";

  var mount = document.getElementById("tell-poll");
  if (!mount) return;

  function params() {
    var out = {};
    function take(src) { try { new URLSearchParams(src).forEach(function (v, k) { if (!(k in out)) out[k] = v; }); } catch (e) {} }
    take(location.search);
    take((location.hash || "").replace(/^#/, ""));
    return out;
  }
  function esc(s) { return String(s).replace(/[<&>]/g, function (c) { return { "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c]; }); }

  var cfg = params();
  if (!cfg.pile || !cfg.round || !cfg.tok) {
    mount.innerHTML = '<p class="tell-empty">No poll loaded — open Tell from a poll’s QR code.</p>';
    return;
  }

  var question = cfg.q || ("Reply to " + cfg.pile);
  var opts = (cfg.opts ? String(cfg.opts).split(",") : ["Yes", "No"]).map(function (s) { return s.trim(); }).filter(Boolean);

  // Build a pre-filled issues/new link for the chosen option. Exposed for tests.
  function issueUrl(answer) {
    var block = {
      schema: "tell.submission/v0",
      pile: cfg.pile, round: cfg.round, tok: cfg.tok,
      answer: answer, ts: new Date().toISOString()
    };
    var body = "Reply to **" + cfg.pile + "** — option: **" + answer + "**\n\n" +
               "```tell\n" + JSON.stringify(block) + "\n```\n";
    var qs = "title=" + encodeURIComponent("tell submission " + cfg.pile) +
             "&labels=" + encodeURIComponent("tell-submission") +
             "&body=" + encodeURIComponent(body);
    return "https://github.com/" + REPO + "/issues/new?" + qs;
  }
  window.tellIssueUrl = issueUrl; // test hook

  var rows = opts.map(function (o) {
    return '<a class="tell-opt" rel="nofollow noopener" target="_blank" href="' + esc(issueUrl(o)) + '">' + esc(o) + "</a>";
  }).join("");

  mount.innerHTML =
    '<p class="tell-loaded">Poll <code>' + esc(cfg.pile) + "</code> (round " + esc(cfg.round) + "):</p>" +
    '<p class="tell-q">' + esc(question) + "</p>" +
    '<div class="tell-grid">' + rows + "</div>" +
    '<p class="tell-fineprint">Choosing an option opens a pre-filled GitHub issue. Review it, then submit to reply.</p>';
})();
</script>
