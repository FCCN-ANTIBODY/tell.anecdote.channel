// The Floor's one module (anecdote.channel#93).
//
// A Floor is the SAME template on every name; the only input is the hostname's
// leading label, which IS the data-pile's name (the alias rule: no separate
// registry maps names to piles — the label is the pile-name component itself,
// colloquially anecdote://data/<name>). Everything else this module does is:
//
//   * viewer — list the questions the mother Tell governs for that pile
//     (polls.json, the public transparency projection) and point the iframe at
//     VANILLA Tell for whichever one is selected. No token rides the link: the
//     Floor cannot mint `tok` (that HMAC needs TELL_QR_SECRET, which stays with
//     the Tell engine), and absent a token Tell falls through to its preview
//     mode — #93's "mode selection is already free".
//
//   * creator — when the pile has no questions yet, emit the artifacts that
//     would create one: the Tell-side constitution, the pile-side
//     anecdote.poll/v1 object, and the supporting pile's handshake stanza.
//     The Floor HOLDS NOTHING and pushes nowhere — it prints data objects the
//     owner places themselves (custody: four parties, and the Floor is the
//     room, not a party).
//
// Pure functions are exported for test/floor.test.mjs; mountFloor() is the page.

export const MOTHER = "https://tell.anecdote.channel";
export const FLOOR_BASE = "tell.anecdote.channel";

// The pile-slug charset is pinned by data-pile's bin/pile-new; the DNS-label
// length bound comes with the alias rule (the id doubles as a hostname label).
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// hostname -> pile name, or null when this isn't a named Floor (the template
// viewed on the mother host, a preview, localhost). Exactly one label deep:
// a.b.tell.anecdote.channel is not a pile alias.
export function floorName(hostname, base = FLOOR_BASE) {
  if (!hostname || !hostname.endsWith("." + base)) return null;
  const label = hostname.slice(0, -(base.length + 1));
  if (label.includes(".") || label.length > 63 || !SLUG.test(label)) return null;
  return label;
}

export function pileAddress(name) {
  return "anecdote://data/" + name;
}

// polls.json rows ({pile, poll, type, text, options, accept_writein, guidance,
// lifecycle?}) filtered to this pile. A pile's "questions" are its poll slugs —
// one anecdote.poll/v1 object per question, never a multi-question container.
export function questionsFor(polls, pile) {
  return (Array.isArray(polls) ? polls : []).filter(
    (p) => p && p.pile === pile && typeof p.poll === "string" && typeof p.text === "string",
  );
}

// The iframe src for one question: vanilla Tell, puppeted by query params the
// same way a QR does (param order mirrors bin/qr), minus the two credentials a
// Floor never has — no `tok`, no `post`/`su`. Values are RFC-3986 encoded; this
// link is CONSTRUCTED, not forwarded, so encoding here is fine (the verbatim
// rule protects signed QRs in flight, and nothing here is signed).
export function tellSrc(q, mother = MOTHER) {
  const pairs = [
    ["pile", q.pile],
    ["poll", q.poll],
  ];
  const round = q.lifecycle && q.lifecycle.round;
  if (round !== undefined && round !== null) pairs.push(["round", String(round)]);
  if (q.type) pairs.push(["type", q.type]);
  if (q.text) pairs.push(["q", q.text]);
  if (Array.isArray(q.options) && q.options.length) pairs.push(["opts", q.options.join(",")]);
  if (q.guidance) pairs.push(["guidance", q.guidance]);
  return mother + "/?" + pairs.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
}

// Creator output: the three data objects that make "a poll (and supporting
// pile)" real, addressed to where each belongs. Emitting them is the whole act
// here; placing them is the owner's gesture (a PR to the Tell, a commit to the
// pile repo) — the Floor never holds a credential to do it for them.
export function draftArtifacts(name, spec) {
  const poll = spec.poll;
  const options = (spec.options || []).map((s) => String(s).trim()).filter(Boolean);
  const constitution = {
    pile: name,
    poll,
    type: spec.type === "multichoice" ? "multichoice" : "open",
    text: spec.text,
    options,
    accept_writein: true,
    guidance: spec.guidance || "",
    lifecycle: { round: 1 },
  };
  const pollObject = {
    schema: "anecdote.poll/v1",
    pile: name,
    poll,
    type: constitution.type,
    text: spec.text,
    options,
    guidance: constitution.guidance,
    lifecycle: { round: 1 },
    tell: MOTHER,
  };
  const handshake = {
    id: name,
    scope: spec.scope || "",
    feed: "feed/" + (spec.scope || "<scope>") + "/" + name,
    age_recipient: "<age1... — mint on the owner's device (anecdote age-mint), never here>",
    repo_url: spec.repo_url || "",
  };
  return {
    constitutionPath: "_data/constitutions/" + name + "/" + poll + ".json",
    constitution,
    pollPath: "poll.json",
    pollObject,
    handshake,
  };
}

// --- page wiring below; everything above is the testable surface -------------

function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// polls.json, offline-tolerant: network first (it's tiny and changes), the
// name-origin's own localStorage as the fallback — which is exactly the per-name
// storage group #92's wildcard PSL entry carves out for this hostname.
async function loadPolls(storage, fetcher) {
  try {
    const r = await fetcher(MOTHER + "/polls.json");
    if (!r.ok) throw new Error("polls.json " + r.status);
    const polls = await r.json();
    try {
      storage.setItem("floor.polls", JSON.stringify(polls));
    } catch (_) {
      /* quota/private mode: viewing still works, offline revisit won't */
    }
    return { polls, offline: false };
  } catch (_) {
    try {
      const cached = storage.getItem("floor.polls");
      if (cached) return { polls: JSON.parse(cached), offline: true };
    } catch (_) {
      /* fall through to empty */
    }
    return { polls: [], offline: true };
  }
}

function renderViewer(doc, questions) {
  const switcher = doc.getElementById("switcher");
  const select = doc.getElementById("question");
  const stage = doc.getElementById("stage");
  select.textContent = "";
  questions.forEach((q, i) => {
    select.appendChild(el(doc, "option", { value: String(i) }, q.poll + " — " + q.text));
  });
  const show = () => {
    const q = questions[Number(select.value) || 0];
    if (q) stage.src = tellSrc(q);
  };
  select.addEventListener("change", show);
  switcher.style.display = "flex";
  stage.style.display = "block";
  show();
}

function renderCreator(doc, name, storage) {
  const creator = doc.getElementById("creator");
  creator.textContent = "";
  creator.appendChild(el(doc, "h2", {}, "No questions on this pile yet — draft one"));
  creator.appendChild(
    el(
      doc,
      "p",
      { class: "muted" },
      "The Floor drafts the data objects; placing them is your own gesture. Nothing typed here leaves this page.",
    ),
  );

  const fields = [
    ["poll", "Poll slug (lowercase, dashes)", "input"],
    ["text", "The question", "textarea"],
    ["options", "Suggested answers (comma-separated; always suggestions, a reply is always custom)", "input"],
    ["guidance", "Guidance shown alongside", "textarea"],
    ["scope", "Scope (for the supporting pile's feed branch)", "input"],
    ["repo_url", "Pile repo URL (if it exists yet)", "input"],
  ];
  const inputs = {};
  const draftKey = "floor.draft";
  let draft = {};
  try {
    draft = JSON.parse(storage.getItem(draftKey) || "{}");
  } catch (_) {
    draft = {};
  }
  for (const [key, label, kind] of fields) {
    const wrap = el(doc, "label", {}, label);
    const input = el(doc, kind, { name: key });
    input.value = draft[key] || "";
    input.addEventListener("input", () => {
      draft[key] = input.value;
      try {
        storage.setItem(draftKey, JSON.stringify(draft));
      } catch (_) {
        /* draft just won't survive reload */
      }
    });
    wrap.appendChild(input);
    creator.appendChild(wrap);
    inputs[key] = input;
  }
  const typeWrap = el(doc, "label", {}, "Type (governance hint only — never gates input)");
  const typeSel = el(doc, "select", { name: "type" });
  typeSel.appendChild(el(doc, "option", { value: "open" }, "open"));
  typeSel.appendChild(el(doc, "option", { value: "multichoice" }, "multichoice"));
  if (draft.type) typeSel.value = draft.type;
  typeWrap.appendChild(typeSel);
  creator.appendChild(typeWrap);

  const out = el(doc, "div", {});
  const button = el(doc, "button", { type: "button" }, "Draft the artifacts");
  button.addEventListener("click", () => {
    out.textContent = "";
    const poll = (inputs.poll.value || "").trim();
    const text = (inputs.text.value || "").trim();
    if (!SLUG.test(poll) || !text) {
      out.appendChild(el(doc, "p", {}, "A poll slug (lowercase, dashes) and a question are required."));
      return;
    }
    const drafted = draftArtifacts(name, {
      poll,
      text,
      type: typeSel.value,
      options: (inputs.options.value || "").split(","),
      guidance: (inputs.guidance.value || "").trim(),
      scope: (inputs.scope.value || "").trim(),
      repo_url: (inputs.repo_url.value || "").trim(),
    });
    const blocks = [
      ["Tell-side constitution → " + drafted.constitutionPath + " (a PR to the Tell registers governance)", drafted.constitution],
      ["Pile-side poll object → " + drafted.pollPath + " (on the pile repo)", drafted.pollObject],
      ["Supporting pile handshake → _data/piles.yml entry (data-pile bin/pile-new prints the same)", drafted.handshake],
    ];
    for (const [title, obj] of blocks) {
      out.appendChild(el(doc, "h3", {}, title));
      out.appendChild(el(doc, "pre", { class: "artifact" }, JSON.stringify(obj, null, 2)));
    }
  });
  creator.appendChild(button);
  creator.appendChild(out);
  creator.style.display = "block";
}

export async function mountFloor(doc, loc, { fetcher = fetch, storage } = {}) {
  const local = storage || (typeof localStorage !== "undefined" ? localStorage : { getItem: () => null, setItem: () => {} });
  const notice = doc.getElementById("notice");
  const name = floorName(loc.hostname);

  if (!name) {
    doc.getElementById("pile-address").textContent = "";
    notice.textContent =
      "This is the Floor template — the same blank slate every name gets. Open it on a pile's own name " +
      "(<pile-name>.tell.anecdote.channel) and this room stages that pile: its questions in the switcher, " +
      "vanilla Tell in the frame. The label IS the pile name — anecdote://data/<pile-name>.";
    return;
  }

  doc.getElementById("pile-address").textContent = pileAddress(name);
  notice.textContent = "Loading questions…";
  const { polls, offline } = await loadPolls(local, fetcher);
  doc.getElementById("net").textContent = offline ? "offline — last known list" : "";

  const questions = questionsFor(polls, name);
  if (questions.length) {
    notice.textContent = "";
    notice.style.display = "none";
    renderViewer(doc, questions);
  } else {
    notice.textContent = "";
    notice.style.display = "none";
    renderCreator(doc, name, local);
  }
}
