// Unit-test the Floor (anecdote.channel#93). The invariants:
//   (a) the name is a KEY — the hostname's leading label is the pile name by
//       convention (one label, pile-slug charset, DNS-label length); anything
//       else is not a named Floor;
//   (b) the network stays out of the room — the module exposes no fetch path;
//       questions enter the vault only by the owner's paste or creation, and
//       the vault round-trips through the name-origin's own storage;
//   (c) the iframe destination is not a choice: vanilla Tell, display params
//       only — no tok, no post, no su can ever appear;
//   (d) drafted artifacts are the pile-side question object and the Tell-side
//       constitution, for the owner to carry by their own means.
import fs from "fs";
import {
  floorName, pileAddress, isQuestion, parseImport, readVault, mergeVault, tellSrc, draftArtifacts, VAULT_KEY,
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
assert(!/(^|[?&])(tok|post|su)=/.test(src), "a credential-shaped param leaked into the iframe src");
const bare = tellSrc({ poll: "q", text: "T?" }, "p");
assert(bare === "https://tell.anecdote.channel/?pile=p&poll=q&q=T%3F", "pile did not default to the name: " + bare);

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

console.log("ok: floor — the name is a key, the vault is local, the iframe is fixed on Tell and carries no credential");
