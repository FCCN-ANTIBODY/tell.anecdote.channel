# Solicitation: statement, need, poll

This note is the *ideological* grounding under the poll surface — the "why," a level above the
mechanical three-layer data model in [`per-poll-registry.md`](per-poll-registry.md). It settles a
question that was previously only answered by infrastructure: **Tell is the poll maker** was a
call about who holds credentials and bakes the QR. It was never a call about *what a poll is* or
*who frames one*. This is that call.

## One bit defines a poll

A poll is the **solicitation of feedback**, and the signal of solicitation is exactly one thing:
**the presence of a prefab answer.** A custom answer is always available — a respondent can always
say their own thing — so a canned option is never there to constrain. It is there to *declare*. The
moment a payload carries any pre-made answer alongside the always-present custom one, it is saying
"I am asking you." One canned option flips it.

This bit is load-bearing, and the reason to guard it is not fastidiousness. The instant a
*statement* or a *need* is allowed to carry prefab answers, "poll" splits into a real poll and a
fake poll, and the signal stops meaning anything. So:

> **Prefab answers live only where solicitation is the point.** Statements and needs do not carry
> them.

## Three shapes on one spine

The whole family is statements. What distinguishes them is that one bit, and what "resolution"
means for each.

| Shape | Prefab answers? | What it is | Resolution |
|---|---|---|---|
| **Statement** (anecdote) | no | a thing said — text *or* an object; always circling "here is a statement" | none; it is published and it stands |
| **Need** | no | a statement that wants a counterparty | **metadata converges until you are adjacent** |
| **Poll** | **yes** | a statement soliciting feedback — a question (text *or* an object: "do you stand for this?") + answers | answers come back |

Both the question of a poll and the body of a statement may be **text or an object**. The shape is
not decided by the medium; it is decided by the bit.

### The need, and why it is not a poll

A need's answer is not an option you pick — it is *finding each other*. The emergency case makes
this vivid: someone puts out a need with a destination in mind, and the system's only job is to
**negotiate better and better metadata until the two parties are next to each other.** That
adjacency *is* the resolution.

Critically, the receiving side is not wired into anecdote. An emergency unit that receives a need
does not reply on anecdote — and if it ever did, that reply channel would be **its own process to
decide**, never something this system builds in. That is why a prefab answer would be a category
error on a need: it presumes an answer-collection loop where the actual loop is metadata
convergence (see civic-node `OPEN-QUESTIONS.md` §E, the matcher; and the need threads). A need is a
statement pointed at a counterparty, not a solicitation of the crowd.

## Who frames what

The division is ideological, not just plumbing. It is a boundary between **authoring**,
**presenting**, and **holding the unsolicited half**.

- **Tell — the solicitation surface.** The name is the tell: *someone is telling you something.*
  That is true at both ends — the build-time *preview* ("here is what I am asking") and the
  answer-time view ("you scanned a poll; here is the question"). Tell owns the look of solicited
  feedback, and it can build a poll **standalone** (the Joe-Schmoe path — no research apparatus
  required).
- **Antidote — the authoring brain and the archive.** A researcher enters a **constitution**, then
  makes questions that fit inside it; Antidote is also the master log — *the data piles unwound and
  archived.* Antidote **puppets Tell**: it iframes Tell as pure UI structure and drives it (GET
  parameters, or the probe line) to preview the poll being authored. It knows **where the data pile
  goes**, because the author provides that. Antidote is not researcher-gated — anyone can author
  through it.
- **Anecdote (`anecdote.channel`) — the unsolicited wall.** The same building gesture, but **no
  prefab answers**. You might attach a file and have something to say about it — and that "something
  to say" is often the **constitution field, not a text field.**

So the split is not two rival builders. It is: **Antidote authors, Tell presents, Anecdote holds
the unsolicited half.** Tell keeps a standalone build path; Antidote drives Tell across a clean
iframe/probe boundary (the same boundary `host-demo` and the composer chamber already use).

## What building a poll produces

**A poll is a data pile with the question attached.** The build stands up the pile up front — empty,
with the question riding on it — because the pile is the durable product; the answers will land
there. This is Layer 1 in [`per-poll-registry.md`](per-poll-registry.md): the poll constitution,
committed, PR-as-consent, tied to its pile. It is the missing `bin/poll`.

The **QR is deferred to signing.** It is not minted at authoring time. The QR (Layer 2) attaches to
the pile only when the author is ready to *sign* the question — because minting the QR is the act of
declaring the poll **shareable**. Making it early is not a convenience; it *is* the shareable
signal.

## The two QR disciplines

There is one axis under all of this, and once you see it the two behaviors stop conflicting:

- **Poll QR — eager.** Minting it *is* the act of declaring "this is shareable now." The poll makes
  its QR early precisely to carve out that shareable space.
- **Everything else — on-demand.** The QR (and the QR *video*, the rateless carrier-loop billboard)
  is transport you make only when you are actually about to move the thing, and reuse if you keep
  moving it. You do not make it eagerly.

This falls straight onto existing substrate: `anecdote.channel`'s `carrier-loop`/`carrier-catch`
demos are the on-demand *video* substrate; the byte-mode carrier (`composer/qr-encode.mjs`
`encodeBytes`, the `register-chamber`/`qr-carrier` demos) is the encodable *pointer* substrate.

### Files: pointer, never payload

A poll **never embeds a file.** Embedding one would force generating the QR *video* and parking it
on the Tell server — but that video is not a scan-me-to-Tell code, so it breaks the poll's "scan
brings you here to answer" contract. Instead:

> A file-bearing poll **points to a public anecdote that has the file** — a URI, far more encodable
> than the bytes. Tell and Antidote hold pointers, never poll file-bytes.

And on the anecdote side, the on-demand rule governs the file itself: **save the file first; mint no
QR eagerly.** A boundary file sitting in an anecdote your Atlas can see is already published as the
raw file. Only when you go to *hand it to someone* — as an ambassador of that Atlas — do you
generate the QR video; it transits the wire, and then either that is the end of it or you keep it to
keep giving to the people around you. On demand.

## Where this connects

- **Data model:** [`per-poll-registry.md`](per-poll-registry.md) — the three layers this note frames.
  `bin/poll` is its Layer-1 writer; `bin/qr` its Layer-2 minter (deferred to signing, per above);
  `bin/open-poll` opens the canonical answer thread.
- **Provenance:** [`qr-provenance.md`](qr-provenance.md) and civic-node `OPEN-QUESTIONS.md` §L — the
  signature that makes a shared poll's origin checkable without a registry.
- **The product surface:** civic-node `OPEN-QUESTIONS.md` §J — this note supplies its missing
  definition (prefab-answers-are-the-signal) and its build shape (pile-with-question-attached).
- **The need / adjacency loop:** civic-node `OPEN-QUESTIONS.md` §E — why a need is a matcher
  behavior, not an answer-collection one.
