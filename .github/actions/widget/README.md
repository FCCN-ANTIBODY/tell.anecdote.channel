# `widget` — render this node's data-filled Tell fragment from its own identity

A composite GitHub Action that renders the **data-filled** Tell widget fragment into the
**calling node's** workspace. It is the live counterpart to the baked baseline at
[`widget/public.html`](../../../widget/public.html): that file is a static, **dataless**
shell a node picks up by bumping this submodule's pin; this action renders the **same
fragment contract** (same `anecdote-widget` classes, same dormant `anecdote:widget:`
postMessage API — a host can't tell which build it got) **from the node's on-disk identity**,
so it carries the node's own geo-stamped locator QR. The bundled `bin/widget` is the **code**;
the node's `atlas.yml` is the **data** — so any node that drops this in renders **its own**
node's QR, never the template's.

## The locator, not a poll token

The QR this bakes is a **stateless locator** — and that is the whole contrast with
[`bin/qr`](../../../bin/qr). `bin/qr` mints a poll-scoped token bound to `{pile, poll, round}`:
there the token **is** the authorization. This QR carries no token and no poll. It hands only
the node's **geo-less stem** — `<tell>.<atlas>` — to the hub, which **fills the scanner's geo
state** and redirects to:

```
<tell>.<atlas>.<state>.anecdote.channel
```

Scanned in the node's home state (`scope`) it resolves; scanned elsewhere the hub returns
not-found until the idea has gone portable. The home state rides along as a `home=` param so
the hub can tell "wrong state" from "portable" — it is **never** baked into the stem the QR
encodes. The hub-side geo fill/redirect is the contract this targets; building it out lives on
the shared hub, not here.

qrencode bakes the QR as **inline SVG** at build time — no runtime JS, no external request.
Without qrencode the fragment degrades to a plain text link, so a node build never breaks.

## Use it

In your node's site build (the workspace mounts `tell` at `tell/`, the same submodule-path
convention as `./tell/.github/actions/advance-engine`), render the fragment before the site
build that includes it:

```yaml
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Render this node's Tell widget
        uses: ./tell/.github/actions/widget   # reads atlas.yml -> _includes/widgets/tell.html
      - name: Build
        uses: ./journal/.github/actions/build
```

Then embed it from the homepage with `{% include widgets/tell.html %}`, or serve the bare
fragment at a URL by adding a front-matter page that includes it.

## Inputs

| input | default | meaning |
| --- | --- | --- |
| `atlas` | *(read from `identity`)* | the `<atlas>` host label; falls back to `id:` in the identity file |
| `scope` | *(read from `identity`)* | home state the hub fills; falls back to `scope:` in the identity file |
| `tell` | `tell` | the `<tell>` host label |
| `identity` | `atlas.yml` | path in the calling workspace to the node's Atlas identity (provides `id` + `scope`) |
| `hub` | `https://tell.anecdote.channel` | shared hub the locator targets |
| `out` | `_includes/widgets/tell.html` | path in the calling workspace to write the fragment to |
| `install-qrencode` | `true` | apt-install qrencode (set `false` if already present) |

It **fails closed**: with no identity file and no explicit `atlas`/`scope` it refuses rather
than render the wrong node — the same contract as the `register` action.
