# Constitutions — the delegated per-poll rule a Tell applies before sealing

Each `_data/constitutions/<pile>/<poll>.json` is the **governing constitution** for one poll on
one pile this Tell fronts: the question, its type, and the **guidance** that decides what
abides. `bin/govern` runs *after* `bin/collect-submissions` and *before* the digest is
sealed — it matches every staged submission (by its `pile` + `poll`) to the file here and
attaches a verdict to the record. Because the submission is still the public Issue's
plaintext at this point, **no decryption key is involved**: Tell judges what it can already
read.

These files live under `_data/` so they are *one* source of truth with two consumers: the
judge (`bin/govern`, server-side) and the **published projection** the build renders to
`/polls.json` (a public, cacheable subset of every poll's config — question, type, options,
`accept_writein`, guidance, and `lifecycle`). A poll's landing page can fetch that projection
instead of trusting render hints carried in the QR, so what a respondent is *shown* and what
the Tell *governs* come from the same place. See `docs/per-poll-registry.md`.

This is the **delegated** half of the seam. A pile opts into this Tell (its handshake PR in
`_data/piles.yml`); the Tell operator curates the constitutions here, and a few good ones
can serve many piles — that is the point of keeping them in one inspectable place. The pile
stays the principal: Tell **attaches** the verdict, it does not withhold the answer. The
sealed digest carries every authorized record *plus* its `governed` verdict and the
`constitution_sha` that produced it, so the pile can trust the call or re-judge it at its
own boundary. See `CONSTITUTION.md` ("I judge only what a pile delegates…").

## Schema

```json
{
  "pile": "cd04-q1",           // the pile (id in _data/piles.yml) this poll belongs to
  "poll": "dog-photo",         // poll id within that pile
  "type": "open",              // "multichoice" | "open"
  "text": "Can I have a picture of your dog?",
  "options": [],               // multichoice only — the accepted answers
  "accept_writein": true,      // whether a non-option answer is even considered
  "guidance": "A jpg or png image of a dog. Joke/non-dog answers do not pass."
}
```

## How each answer is judged (`bin/govern`)

- **multichoice + answer is a listed option** → `accept`, mechanically (rule `auto`). No agent needed.
- **anything else** (a write-in, or any `open` answer) → handed to the **judge** (`bin/judge`, or
  your `TELL_JUDGE_CMD`). The default judge applies cheap guards (empty → `reject`; write-in when
  `accept_writein:false` → `reject`) and otherwise returns **`needs-judgment`** — honest about the
  fact that an open answer against guidance is a call for a human or an agent, *work that can be done
  in parallel*. Plug a real judge into `TELL_JUDGE_CMD` to resolve those before sealing.
- **no constitution for the poll** → `held` (rule `none`): the record is delivered unjudged; the
  pile decides. A Tell that does not want to govern a poll simply ships no file for it.

Editing a file is a **live patch**: the next `bin/govern` run judges by the new text and records
which version it used (`constitution_sha` in both the report and the sealed record). The QR a
respondent scanned may have *shown* its own question/guidance; that is a display copy carried as
`shown_guidance` for transparency. **This registry is what governs.**

Every run writes a transparency report to `reports/govern-<stamp>.json` with each verdict, its
reason, the `constitution_sha` in effect, and the Issue number that carried it — a public,
pre-seal record that ties *what was judged* to *the rule in force* and *the mailbox it came from*.
