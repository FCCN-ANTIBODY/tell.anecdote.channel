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
  Your reply posts as a public GitHub issue carrying only your chosen option or typed answer (plus the poll's token).
  Tell encrypts it to the pile owner and closes the issue; don't put anything private in a reply.
</p>

<script>
(function () {
  "use strict";
  // The Tell repo whose Issues are this poll's mailbox. The QR may address a specific
  // jurisdiction Tell via &repo=OWNER/NAME (so a scan on the shared tell.anecdote.channel
  // domain routes to YOUR Tell); we accept it only if it is a clean OWNER/NAME, else fall
  // back to the canonical repo. The mint binds pile+poll+round, not the repo — a Tell that
  // did not mint the token rejects it, so a swapped repo cannot smuggle a reply in.
  var CANONICAL_REPO = "FCCN-ANTIBODY/tell.anecdote.channel";

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
  // The exact signed query, verbatim, so a signed poll's provenance travels into the reply
  // (the Tell verifies cfg.sig over this; see docs/qr-provenance.md). Search is where bin/qr
  // puts the params; fall back to the hash. Not decoded — the bytes must match what was signed.
  var rawQuery = (location.search || "").replace(/^\?/, "") || (location.hash || "").replace(/^#/, "");
  if (!cfg.pile || !cfg.poll || !cfg.round || !cfg.tok) {
    mount.innerHTML = '<p class="tell-empty">No poll loaded — open Tell from a poll’s QR code.</p>';
    return;
  }

  var question = cfg.q || ("Reply to " + cfg.pile + " / " + cfg.poll);
  var opts = (cfg.opts ? String(cfg.opts).split(",") : []).map(function (s) { return s.trim(); }).filter(Boolean);
  var repo = (cfg.repo && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(cfg.repo)) ? cfg.repo : CANONICAL_REPO;
  // A poll takes a typed answer when it is open (the default type), when it explicitly opts a
  // write-in alongside fixed options (&writein=1), or when it offers no options at all — so we
  // never fabricate a yes/no the poll never asked. multichoice without write-in shows links only.
  var allowWritein = (cfg.type || "open") !== "multichoice"
    || /^(1|true|yes)$/i.test(cfg.writein || "")
    || opts.length === 0;

  // Build a pre-filled issues/new link for the chosen option. Exposed for tests.
  // The token binds pile+poll+round; type+asker ride along so the pile can route.
  function issueUrl(answer) {
    var block = {
      schema: "tell.submission/v1",
      pile: cfg.pile, poll: cfg.poll, round: cfg.round,
      type: cfg.type || "open", asker: cfg.asker || "",
      shown_guidance: cfg.guidance || "",
      tok: cfg.tok, answer: answer, ts: new Date().toISOString()
    };
    // Carry the signed poll payload so the Tell can verify provenance before processing.
    if (cfg.sig) block.qr = rawQuery;
    var body = "Reply to **" + cfg.pile + "** / poll **" + cfg.poll + "** — option: **" + answer + "**\n\n" +
               "```tell\n" + JSON.stringify(block) + "\n```\n";
    var qs = "title=" + encodeURIComponent("tell submission " + cfg.pile + " / " + cfg.poll) +
             "&labels=" + encodeURIComponent("tell-submission") +
             "&body=" + encodeURIComponent(body);
    return "https://github.com/" + repo + "/issues/new?" + qs;
  }
  window.tellIssueUrl = issueUrl; // test hook

  var rows = opts.map(function (o) {
    return '<a class="tell-opt" rel="nofollow noopener" target="_blank" href="' + esc(issueUrl(o)) + '">' + esc(o) + "</a>";
  }).join("");

  // Open polls (and any poll with no fixed options) get a text field, so a respondent can give
  // the answer the poll is actually asking for. The page still only *builds a link*: typing
  // updates the compose link's href, and the click that opens the prefilled issue is yours.
  var writein = allowWritein
    ? '<div class="tell-writein">' +
        '<label class="tell-writein-label" for="tell-answer">' +
          (opts.length ? "Or write your own answer:" : "Your answer:") + "</label>" +
        '<textarea id="tell-answer" class="tell-textarea" rows="3" placeholder="Type your reply…"></textarea>' +
        '<a id="tell-submit" class="tell-opt tell-submit" rel="nofollow noopener" target="_blank" aria-disabled="true" href="#">Compose reply</a>' +
      "</div>"
    : "";

  mount.innerHTML =
    '<p class="tell-loaded">Poll <code>' + esc(cfg.poll) + "</code> on <code>" + esc(cfg.pile) + "</code> (round " + esc(cfg.round) + "):</p>" +
    '<p class="tell-q">' + esc(question) + "</p>" +
    (cfg.guidance ? '<p class="tell-guidance">' + esc(cfg.guidance) + "</p>" : "") +
    (rows ? '<div class="tell-grid">' + rows + "</div>" : "") +
    writein +
    '<p class="tell-fineprint">' +
      (allowWritein ? "Typing an answer" + (opts.length ? " or choosing an option" : "") : "Choosing an option") +
      " opens a pre-filled GitHub issue. Review it, then submit to reply.</p>";

  // Wire the write-in field in a real browser; the test stub has no event API, so feature-detect.
  if (allowWritein) {
    var ta = document.getElementById("tell-answer");
    var go = document.getElementById("tell-submit");
    if (ta && go && ta.addEventListener) {
      var sync = function () {
        var v = (ta.value || "").trim();
        go.setAttribute("href", v ? issueUrl(v) : "#");
        go.setAttribute("aria-disabled", v ? "false" : "true");
      };
      ta.addEventListener("input", sync);
      go.addEventListener("click", function (e) {
        if (go.getAttribute("aria-disabled") === "true") e.preventDefault();
      });
      sync();
    }
  }
})();
</script>
