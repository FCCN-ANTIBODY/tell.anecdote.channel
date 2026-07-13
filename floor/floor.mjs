// The Floor's one module (anecdote.channel#93).
//
// The name is a KEY, not an address. Every <name>.tell.anecdote.channel serves
// this same page; the network's whole job is to hand over the identical clean
// room for any name, forever. What the name actually does happens HERE, on the
// client: the browser's same-origin rule makes each hostname its own hermetic
// local-storage vault, so typing a made-up name MINTS one. By convention the
// name is the slug of the data-pile the user means — colloquially
// anecdote://data/<name> — and this page uses it to open that pile's local
// presence in the vault.
//
// The network stays out of the room. Nothing here fetches anything: a
// data-pile is a PRIVATE repo, never deployed, never addressable — its
// questions arrive in the vault only by the owner's own gesture (pasted in
// from cold storage, or created right here). The one outward surface is the
// iframe, and its destination is not a choice: it points at vanilla Tell,
// puppeted per-question by display params the way a QR would be — never a
// tok, never a credential (only the Tell engine can mint those).
//
// Pure functions are exported for test/floor.test.mjs; mountFloor() is the page.

export const TELL = "https://tell.anecdote.channel";
export const FLOOR_BASE = "tell.anecdote.channel";
export const VAULT_KEY = "floor.questions";

// A DNS-legal, pile-slug-shaped label (data-pile bin/pile-new's charset; the
// 63-char bound is the DNS label rule the alias convention inherits).
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// The wildcard sub-sub-domain serves THIS SAME template on every path, so the path it loaded on IS the whole
// initial instruction. storageRequest recognizes a storage-adapter request — /storage/.<adapter> — purely by
// that path (mirrors composer/bottle-uri.mjs storageRequest; kept in sync by hand, the constellation's mirror
// discipline). No storage path → not an adapter request.
const STORAGE = "storage";
export function storageRequest(pathname) {
  const segs = String(pathname == null ? "" : pathname).split("/").filter(Boolean);
  if (segs.length !== 2 || segs[0] !== STORAGE || !segs[1].startsWith(".")) return null;
  const adapter = segs[1].slice(1);
  return SLUG.test(adapter) ? { capability: STORAGE, adapter } : null;
}

// The role this template takes from the path it was loaded on: a storage ADAPTER (/storage/.<adapter>) or the
// PILE floor (anything else). Every wildcard path serves this one file; the path selects the role.
export function floorRole(pathname) {
  const s = storageRequest(pathname);
  return s ? { role: "adapter", adapter: s.adapter } : { role: "pile" };
}

// hostname -> the name, or null when this isn't a named Floor (the canonical
// origin the wildcard masks, the template viewed on the mother host, a local
// preview). Exactly one label deep — the TLS wildcard covers one label, so
// deeper names never resolve this far anyway.
export function floorName(hostname, base = FLOOR_BASE) {
  if (!hostname || !hostname.endsWith("." + base)) return null;
  const label = hostname.slice(0, -(base.length + 1));
  if (label.includes(".") || label.length > 63 || !SLUG.test(label)) return null;
  return label;
}

export function pileAddress(name) {
  return "anecdote://data/" + name;
}

// A question is one anecdote.poll/v1-shaped object (one object = one question;
// a pile's questions are its poll slugs, never a multi-question container).
// Minimal shape gate for anything entering the vault.
export function isQuestion(q) {
  return !!q && typeof q.poll === "string" && SLUG.test(q.poll) && typeof q.text === "string" && q.text.length > 0;
}

// Parse an owner's paste — one question object, or an array of them (the
// cold-storage export case). Returns the accepted questions; anything
// unshaped is dropped, not repaired.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    return [];
  }
  const list = Array.isArray(data) ? data : [data];
  return list.filter(isQuestion);
}

// The vault: this name-origin's own localStorage. Merge by poll slug — a
// re-import of the same slug replaces (the pile is the truth; the vault is
// its local presence).
export function readVault(storage) {
  try {
    const raw = storage.getItem(VAULT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isQuestion) : [];
  } catch (_) {
    return [];
  }
}

export function mergeVault(existing, incoming) {
  const bySlug = new Map(existing.map((q) => [q.poll, q]));
  for (const q of incoming) bySlug.set(q.poll, q);
  return [...bySlug.values()];
}

function writeVault(storage, questions) {
  try {
    storage.setItem(VAULT_KEY, JSON.stringify(questions));
    return true;
  } catch (_) {
    return false; // quota/private mode: the session still works, persistence doesn't
  }
}

// The iframe src for one question: vanilla Tell, and ONLY vanilla Tell —
// the destination is fixed, the question's fields ride as display params
// (order mirrors bin/qr, minus the credentials a Floor never has: no tok,
// no post, no su). Absent a token Tell renders its preview branch.
export function tellSrc(q, name) {
  const pairs = [
    ["pile", q.pile || name],
    ["poll", q.poll],
  ];
  const round = q.lifecycle && q.lifecycle.round;
  if (round !== undefined && round !== null) pairs.push(["round", String(round)]);
  if (q.type) pairs.push(["type", q.type]);
  if (q.text) pairs.push(["q", q.text]);
  if (Array.isArray(q.options) && q.options.length) pairs.push(["opts", q.options.join(",")]);
  if (q.guidance) pairs.push(["guidance", q.guidance]);
  // The bottle's law (antidote docs/faces.md, face 2 → slice 4): a question authored under a
  // constitution carries that constitution's content hash forward, so the answer wears it. Only a
  // well-formed sha256 pointer rides — a malformed one is no terms at all and is simply not carried.
  if (q.constitution && /^sha256:[0-9a-f]{64}$/.test(q.constitution)) pairs.push(["constitution", q.constitution]);
  return TELL + "/?" + pairs.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
}

// Creator output: the question as the pile-side anecdote.poll/v1 object, plus
// the Tell-side constitution for whenever the owner registers it out in the
// wild. Both are shown for the owner to carry to the private pile repo by
// their own means — the Floor holds no credential and pushes nothing.
export function draftArtifacts(name, spec) {
  const options = (spec.options || []).map((s) => String(s).trim()).filter(Boolean);
  const type = spec.type === "multichoice" ? "multichoice" : "open";
  const question = {
    schema: "anecdote.poll/v1",
    pile: name,
    poll: spec.poll,
    type,
    text: spec.text,
    options,
    guidance: spec.guidance || "",
    lifecycle: { round: 1 },
    tell: TELL,
  };
  const constitution = {
    pile: name,
    poll: spec.poll,
    type,
    text: spec.text,
    options,
    accept_writein: true,
    guidance: spec.guidance || "",
    lifecycle: { round: 1 },
  };
  return {
    question,
    constitutionPath: "_data/constitutions/" + name + "/" + spec.poll + ".json",
    constitution,
  };
}

// One question's one-line label for the pile panel (slug — question). Exported so
// the panel and the test agree on exactly what a row reads.
export function questionLabel(q) {
  return q.poll + " — " + q.text;
}

// The creator's heading adapts to the pile's state: an empty pile opens STRAIGHT
// into asking its first question (the name was just minted; there is nothing to
// browse yet), while a pile that already holds questions offers to add another.
export function creatorHeading(name, count) {
  return count ? "Add another question" : "Ask " + name + "'s first question";
}

// The two artifacts a created question produces, each ready to CARRY to where it
// belongs — the pile-side object for the private pile repo, and the Tell-side
// constitution for whenever it goes out in the wild (with its destination path in
// the title). The Floor pushes nothing; it hands the owner exactly these bytes.
export function carryBlocks(drafted) {
  return [
    { title: "In the vault, and for the pile repo (poll.json / its questions dir)", json: JSON.stringify(drafted.question, null, 2) },
    { title: "For the Tell, whenever this goes out in the wild → " + drafted.constitutionPath, json: JSON.stringify(drafted.constitution, null, 2) },
  ];
}

// --- page wiring below; everything above is the testable surface -------------

function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// The pile view: a SCROLLING PANEL of this pile's questions beside a single Tell
// stage. Picking a question re-aims the one iframe — one page, no navigation, so a
// pile of a hundred questions stays one view (the panel scrolls, the stage swaps).
function renderViewer(doc, name, questions) {
  const viewer = doc.getElementById("viewer");
  const panel = doc.getElementById("panel");
  const stage = doc.getElementById("stage");
  panel.textContent = "";
  const rows = [];
  const select = (i) => {
    rows.forEach((r, j) => r.setAttribute("aria-current", j === i ? "true" : "false"));
    const q = questions[i];
    if (q) stage.src = tellSrc(q, name);
  };
  questions.forEach((q, i) => {
    const row = el(doc, "button", { type: "button", "aria-current": "false" }, questionLabel(q));
    row.addEventListener("click", () => select(i));
    panel.appendChild(row);
    rows.push(row);
  });
  viewer.style.display = "flex";
  if (questions.length) select(0);
}

function renderImport(doc, name, storage, onChange) {
  const mount = doc.getElementById("import");
  mount.textContent = "";
  mount.appendChild(el(doc, "h2", {}, "Bring this pile's questions into the room"));
  mount.appendChild(
    el(
      doc,
      "p",
      { class: "muted" },
      "Paste anecdote.poll/v1 question objects (one, or an array) from your own pile — cold storage, " +
        "the pile repo, wherever you keep it. Nothing typed here leaves this page; the vault is this " +
        "name's own local storage.",
    ),
  );
  const area = el(doc, "textarea", { placeholder: '{"schema":"anecdote.poll/v1","poll":"…","text":"…"}' });
  const status = el(doc, "p", { class: "muted" });
  const button = el(doc, "button", { type: "button" }, "Import into the vault");
  button.addEventListener("click", () => {
    const accepted = parseImport(area.value);
    if (!accepted.length) {
      status.textContent = "Nothing shaped like a question in that paste.";
      return;
    }
    const merged = mergeVault(readVault(storage), accepted);
    writeVault(storage, merged);
    status.textContent = accepted.length + " question(s) in — the room now holds " + merged.length + ".";
    area.value = "";
    onChange(merged);
  });
  mount.appendChild(area);
  mount.appendChild(button);
  mount.appendChild(status);
  mount.style.display = "block";
}

function renderCreator(doc, name, storage, onChange) {
  const creator = doc.getElementById("creator");
  creator.textContent = "";
  creator.appendChild(el(doc, "h2", { id: "creator-heading" }, creatorHeading(name, readVault(storage).length)));
  creator.appendChild(
    el(
      doc,
      "p",
      { class: "muted" },
      "A question is a filter for what the pile lets in. Creating one writes it into this room's vault " +
        "and shows the objects to carry back to the pile by your own means.",
    ),
  );

  const fields = [
    ["poll", "Poll slug (lowercase, dashes)", "input"],
    ["text", "The question", "textarea"],
    ["options", "Suggested answers (comma-separated; suggestions only — a reply is always custom)", "input"],
    ["guidance", "Guidance shown alongside", "textarea"],
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
  typeSel.addEventListener("change", () => {
    draft.type = typeSel.value;
    try {
      storage.setItem(draftKey, JSON.stringify(draft));
    } catch (_) {
      /* ditto */
    }
  });
  typeWrap.appendChild(typeSel);
  creator.appendChild(typeWrap);

  const out = el(doc, "div", {});
  const button = el(doc, "button", { type: "button" }, "Create in this room");
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
    });
    const merged = mergeVault(readVault(storage), [drafted.question]);
    writeVault(storage, merged);
    for (const block of carryBlocks(drafted)) {
      out.appendChild(el(doc, "h3", {}, block.title));
      out.appendChild(el(doc, "pre", { class: "artifact" }, block.json));
      // Carry it by the owner's own means — the Floor holds no credential and
      // pushes nowhere, so "carry" is a clipboard copy, never a network call.
      const copy = el(doc, "button", { type: "button", class: "copy" }, "Copy");
      copy.addEventListener("click", () => {
        try {
          navigator.clipboard.writeText(block.json);
          copy.textContent = "Copied — carry it to your pile";
        } catch (_) {
          copy.textContent = "Copy unavailable — select the text above";
        }
      });
      out.appendChild(copy);
    }
    onChange(merged);
  });
  creator.appendChild(button);
  creator.appendChild(out);
  creator.style.display = "block";
}

export function mountFloor(doc, loc, { storage } = {}) {
  const local =
    storage || (typeof localStorage !== "undefined" ? localStorage : { getItem: () => null, setItem: () => {} });
  const notice = doc.getElementById("notice");
  const name = floorName(loc.hostname);

  if (!name) {
    doc.getElementById("pile-address").textContent = "";
    notice.textContent =
      "This is the Floor template — the same blank slate every name gets. Make up a name " +
      "(<name>.tell.anecdote.channel) and that name is your key: it carves out a local vault of its own, " +
      "and by convention it is the slug of the data-pile you mean — anecdote://data/<name>.";
    return;
  }

  doc.getElementById("pile-address").textContent = pileAddress(name);
  notice.style.display = "none";

  const count = doc.getElementById("pile-count");
  const refresh = (questions) => {
    if (count) count.textContent = questions.length ? questions.length + (questions.length === 1 ? " question" : " questions") : "";
    const ch = doc.getElementById("creator-heading");
    if (ch) ch.textContent = creatorHeading(name, questions.length);
    if (questions.length) renderViewer(doc, name, questions);
  };
  const questions = readVault(local);
  renderImport(doc, name, local, refresh);
  renderCreator(doc, name, local, refresh);
  refresh(questions);
}

// Adapter mode: this template was loaded on a /storage/.<adapter> path, so it IS that adapter — not the pile
// UI. The adapter's runtime (git-enough via serveOnHello, vendored in) is wired here in the next gap; until
// then an unwired adapter offers nothing (the safe default, exactly like an unprovisioned bottle) and only
// names the role. Returns { role, adapter } so a test can see the dispatch.
function mountAdapter(doc, loc, role) {
  const notice = doc.getElementById("notice");
  if (notice) {
    notice.style.display = "block";
    notice.textContent = "storage adapter: " + role.adapter + " — served over the probe (runtime not yet wired here).";
  }
  const addr = doc.getElementById("pile-address");
  if (addr) addr.textContent = "";
  return { role: "adapter", adapter: role.adapter };
}

// THE ENTRY: every wildcard path loads this same template; boot reads the path and takes its role. A
// /storage/.<adapter> path → the adapter; anything else → the pile floor.
export function boot(doc, loc, opts = {}) {
  const role = floorRole(loc.pathname || "/");
  if (role.role === "adapter") return mountAdapter(doc, loc, role);
  return mountFloor(doc, loc, opts) || { role: "pile" };
}
