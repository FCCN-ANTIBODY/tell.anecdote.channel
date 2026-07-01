# The answer runtime moved to anecdote.channel

The landing page (`index.md`) used to render the poll and build the reply itself. It no longer does. **The
canonical Tell website is anecdote shaped by a QR**, so the answer UI now lives in the runtime it always
belonged to — **anecdote.channel** — and `index.md` is a thin **forward**.

## Why

The QR was addressed to a Tell from the start: its token binds `{pile, poll, round}` and only the minting
Tell can verify it (see [qr-provenance.md](qr-provenance.md)). Where the reply is *composed* is a separate
concern from where it's *authorized*. bin/qr already names anecdote.channel as the runtime (the `--repo` /
`post` credential notes): the runtime is the thing that turns a scan into a submission. Consolidating the
answer UI there means one implementation of the wire format, not two that can drift.

## What stays here (the Tell engine)

Retiring the **client page** does not touch the **server ingress**. The Tell is still the recipient and
sealer:

- `bin/collect-submissions` / `bin/authz` — sweep + authorize replies (token, and provenance if signed).
- `bin/govern` / `bin/deliver` / `bin/finalize-submissions` — judge, seal, and signal outcomes.
- `bin/qr` / `bin/open-poll` — mint QRs / open canonical poll issues.

Only the browser-side render+submit logic left (`index.md`'s inline script, and the composer-only rules in
`assets/tell.css`). `widget/public.html` is a civic-node embed and is unrelated.

## The forward

`index.md` reads the poll's query **verbatim** (search, or hash as the fallback) and redirects to:

```
https://anecdote.channel/poll.html?<the exact query>
```

Verbatim matters: a signed poll's `sig` covers a canonical preimage of the payload, so the bytes must not be
re-encoded in transit. A `<noscript>` note and a manual "Continue" link cover the no-redirect case. With no
poll in the URL, the page shows the empty state and does not redirect.

## The runtime side

anecdote.channel serves `poll.html`: it reads the query and hands it to a powerless `data:` chamber over the
probe line, which renders the question and — **always offering a custom answer, options only as
suggestions** — builds the pre-filled GitHub issue carrying a `tell.submission/v1` block. The block's wire
format is held **byte-identical** to what this repo used to emit (anecdote's `composer/poll-answer.test.mjs`
freezes the old construction as its oracle), so `bin/authz` / `bin/collect-submissions` accept it unchanged.

anecdote can also **mint** the QR itself now (`composer/qr-mint.mjs`, byte-parity with `bin/qr`), when it
holds the pile's `TELL_QR_SECRET` — so an offline operator runs the whole loop (author → mint → answer →
host → tally) without this repo minting anything. New QRs can point straight at `anecdote.channel/poll.html`;
old QRs on this domain still work via the forward above.
