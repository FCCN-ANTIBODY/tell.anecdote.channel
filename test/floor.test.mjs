// Unit-test the Floor (anecdote.channel#93). The invariants:
//   (a) the name is a KEY — the hostname's leading label is the pile name by
//       convention (one label, pile-slug charset, DNS-label length); anything
//       else is not a named Floor;
//   (b) the network stays out of the room — the module exposes no fetch path;
//       questions enter the vault only by the owner's paste or creation, and
//       the vault round-trips through the name-origin's own storage;
//   (c) the iframe destination is not a choice: vanilla Tell, display params
//       only — no tok, no post, no submit can ever appear;
//   (d) drafted artifacts are the pile-side question object and the Tell-side
//       constitution, for the owner to carry by their own means.
import fs from "fs";
import {
  floorName, pileAddress, isQuestion, parseImport, readVault, mergeVault, tellSrc, draftArtifacts, questionLabel, creatorHeading, carryBlocks,
  storageRequest, floorRole, boot, VAULT_KEY,
} from "../floor/floor.mjs";

function assert(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } }

// (a) the alias rule — the key shape
assert(floorName("some-pile-name.tell.anecdote.channel") === "some-pile-name", "leaf label not taken as the pile name");
assert(pileAddress("some-pile-name") === "anecdote://data/some-pile-name", "colloquial pile address wrong");
for (const notAFloor of [
  "tell.anecdote.channel",                      // the mother host serves the template, keys nothing
  "a.b.tell.anecdote.channel",                  // one label deep (the TLS wildcard covers one)
  "Some-Pile.tell.anecdote.channel",            // pile-slug charset (bin/pile-new's rule)
  "-bad.tell.anecdote.channel",
  "x".repeat(64) + ".tell.anecdote.channel",    // DNS label bound
  "anecdote.channel",
  "localhost",
  "",
]) {
  assert(floorName(notAFloor) === null, "accepted a non-key hostname: " + notAFloor);
}

// (b) no fetch path — the module never reaches for the network
const source = fs.readFileSync(new URL("../floor/floor.mjs", import.meta.url), "utf8");
assert(!/\bfetch\s*\(/.test(source) && !/XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/.test(source),
  "floor.mjs grew a network surface — the network stays out of the room");

// the vault round-trip: paste -> parse -> merge -> storage -> read
const store = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; })();
const paste = JSON.stringify([
  { schema: "anecdote.poll/v1", pile: "some-pile-name", poll: "budget", text: "Cut or keep?", options: ["Cut", "Keep"], lifecycle: { round: 2 }, type: "multichoice" },
  { poll: "parks", text: "More parks?" },            // minimal but shaped -> in
  { poll: "NOPE", text: "bad slug" },                 // unshaped -> dropped, not repaired
  { poll: "empty", text: "" },
  "garbage",
]);
const accepted = parseImport(paste);
assert(accepted.length === 2 && accepted[0].poll === "budget" && accepted[1].poll === "parks", "paste parsing wrong");
assert(parseImport("{not json").length === 0, "bad JSON not tolerated");
assert(parseImport(JSON.stringify({ poll: "solo", text: "One?" })).length === 1, "single-object paste not accepted");

store.setItem(VAULT_KEY, JSON.stringify(accepted));
const held = readVault(store);
assert(held.length === 2, "vault did not round-trip");
assert(readVault({ getItem: () => "{corrupt", setItem: () => {} }).length === 0, "corrupt vault not tolerated");

// merge is by poll slug — a re-import replaces, never duplicates
const merged = mergeVault(held, [{ poll: "budget", text: "Cut or keep, revised?" }, { poll: "roads", text: "Fix roads?" }]);
assert(merged.length === 3, "merge duplicated or dropped");
assert(merged.find((q) => q.poll === "budget").text === "Cut or keep, revised?", "re-import did not replace by slug");

// (c) the switcher's iframe link — fixed destination, display params only
const src = tellSrc(held[0], "some-pile-name");
assert(
  src === "https://tell.anecdote.channel/?pile=some-pile-name&poll=budget&round=2&type=multichoice&q=Cut%20or%20keep%3F&opts=Cut%2CKeep",
  "iframe src wrong: " + src,
);
assert(!/(^|[?&])(tok|post|submit)=/.test(src), "a credential-shaped param leaked into the iframe src");
const bare = tellSrc({ poll: "q", text: "T?" }, "p");
assert(bare === "https://tell.anecdote.channel/?pile=p&poll=q&q=T%3F", "pile did not default to the name: " + bare);

// (c2) a question authored under a bottle carries its constitution forward — the inverse-of-Tell
// handoff (antidote docs/faces.md slice 4). A well-formed pointer rides; a malformed one never does.
const C = "sha256:" + "a".repeat(64);
const worn = tellSrc({ poll: "q", text: "T?", constitution: C }, "p");
assert(worn === "https://tell.anecdote.channel/?pile=p&poll=q&q=T%3F&constitution=" + encodeURIComponent(C),
  "the bottle's constitution did not ride the iframe src: " + worn);
const faked = tellSrc({ poll: "q", text: "T?", constitution: "sha256:short" }, "p");
assert(!/constitution=/.test(faked), "a malformed constitution pointer must not be carried: " + faked);

// (c3) the pile panel row label — the scrolling switcher and the test agree on the row text
assert(questionLabel(held[0]) === "budget — Cut or keep?", "pile panel row label wrong: " + questionLabel(held[0]));

// (c4) the creator heading opens an empty pile straight into its first question, then offers more
assert(creatorHeading("some-pile-name", 0) === "Ask some-pile-name's first question", "empty pile must open into its first question: " + creatorHeading("some-pile-name", 0));
assert(creatorHeading("some-pile-name", 3) === "Add another question", "a populated pile offers another question: " + creatorHeading("some-pile-name", 3));

// (d) creator artifacts
const drafted = draftArtifacts("some-pile-name", {
  poll: "budget", text: "Cut or keep?", type: "multichoice", options: [" Cut ", "Keep", ""], guidance: "g",
});
assert(isQuestion(drafted.question) && drafted.question.schema === "anecdote.poll/v1", "created question unshaped");
assert(drafted.question.pile === "some-pile-name" && drafted.question.tell === "https://tell.anecdote.channel",
  "question must carry its pile name and addressable Tell");
assert(drafted.question.options.join(",") === "Cut,Keep", "options not trimmed/filtered");
assert(drafted.constitutionPath === "_data/constitutions/some-pile-name/budget.json", "constitution path wrong");
assert(drafted.constitution.accept_writein === true, "a drafted constitution must never close the write-in door");

// (d2) the carry blocks — exactly the two artifacts, each carriable as its own bytes; the Tell
// block names its destination path, and both round-trip back to the drafted objects.
const carried = carryBlocks(drafted);
assert(carried.length === 2, "a created question carries exactly two artifacts");
assert(JSON.parse(carried[0].json).schema === "anecdote.poll/v1", "first carry block is the pile-side question");
assert(carried[1].title.includes(drafted.constitutionPath), "the Tell carry block names its destination path");
assert(JSON.parse(carried[1].json).accept_writein === true, "the carried constitution is the drafted one");

// (e) path-dispatch — every wildcard path serves this one template; the path it loads on selects its role.
assert(storageRequest("/storage/.git") && storageRequest("/storage/.git").adapter === "git", "storageRequest(/storage/.git) → git");
assert(storageRequest("/storage/.opfs").adapter === "opfs", "storageRequest recognizes other adapters");
for (const p of ["/", "", "/storage/", "/storage/git", "/.git", "/index.html", "/storage/.git/extra", "/store/.git"])
  assert(storageRequest(p) === null, "not a storage facet → null: " + JSON.stringify(p));
assert(floorRole("/").role === "pile" && floorRole("/index.html").role === "pile", "a non-facet path → the pile floor role");
const gitRole = floorRole("/storage/.git");
assert(gitRole.role === "adapter" && gitRole.adapter === "git", "the /storage/.git facet → the git adapter role");

// boot dispatches on the path: an adapter path does NOT mount the pile UI; the pile path does.
(() => {
  const nodes = {};
  const doc = {
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
    getElementById: (id) => (nodes[id] = nodes[id] || { style: {}, textContent: "", appendChild() {}, setAttribute() {}, addEventListener() {} }),
  };
  const adapter = boot(doc, { hostname: "cd04-q1.tell.anecdote.channel", pathname: "/storage/.git" });
  assert(adapter && adapter.role === "adapter" && adapter.adapter === "git", "boot on /storage/.git → adapter role");
  assert((nodes["pile-count"] === undefined) || nodes["pile-count"].textContent === "", "adapter mode does not mount the pile UI");
  const pile = boot(doc, { hostname: "cd04-q1.tell.anecdote.channel", pathname: "/" }, { storage: { getItem: () => null, setItem() {} } });
  assert(pile && pile.role === "pile", "boot on / → pile floor role");
})();

console.log("ok: floor — the name is a key, the vault is local, the iframe is fixed on Tell, and the path selects the role");
