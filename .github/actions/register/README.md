# `register` — list your own Tell on an Atlas, signing your ownership

A composite GitHub Action that registers **your** Tell with an Atlas directory. It reads
**your** identity (`tell.yml`) and **your** published fingerprint (`keys/tell.fpr`) from
your repo, then opens a consent PR appending your entry to the Atlas's `_data/tells.yml`,
on a **`tell/<scope>/<id>` branch whose commit is signed with your delivery-signer key**.
The branch names the ownership claim, the signature proves it, the entry's `signer` field
anchors it. The bundled `bin/register` is the code; your identity is the data — so any repo
that drops this in registers **its own** Tell, never the template's.

## Consent, not conquest

Registration reaches another repo on purpose: it is the **consent handshake of a discovery
network**. You *offer* your Tell; the Atlas *accepts* by merging your PR; and the piles
behind you keep the right to *leave* you for an Atlas they prefer — consent is present in
every outcome, including the ones in conflict (see
[`CONTRACT.md`](../../../CONTRACT.md) → "Registering with an Atlas"). That is why this needs
a token with write on the **Atlas** (`pr-token`): the reach is the consent gesture, not a
privilege over anyone's data. No write access to your Tell is ever requested.

## Use it

In your jurisdiction's Tell repo, add `.github/workflows/register-atlas.yml`:

```yaml
name: register-atlas
on:
  workflow_dispatch:
    inputs:
      atlas:
        description: "Atlas repo to register with (owner/name)"
        default: FCCN-ANTIBODY/atlas.anecdote.channel
permissions:
  contents: read
jobs:
  register:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: FCCN-ANTIBODY/tell.anecdote.channel/.github/actions/register@main
        with:
          atlas:      ${{ inputs.atlas }}
          pr-token:   ${{ secrets.ATLAS_PR_TOKEN }}
          signer-key: ${{ secrets.TELL_SIGNER_KEY }}
```

Then:

1. **Identity.** Add your own `tell.yml` (`id`, `name`, `url`, `scope`, `reports`). The
   action **refuses to run without it** — it will not register the template's Tell.
2. **Signer.** Run `bin/tell-bootstrap` once to generate your delivery signer and publish
   `keys/tell.fpr`; the action signs the registration commit with `TELL_SIGNER_KEY`, the
   same key that signs your digests. Without it the PR still opens, but unsigned — the
   ownership claim won't verify.
3. **Token.** Provide `ATLAS_PR_TOKEN` with Contents+PR write on the Atlas. Without it, the
   action prints the entry for you to paste by hand.

## Inputs

| Input | Default | What |
| --- | --- | --- |
| `atlas` | `FCCN-ANTIBODY/atlas.anecdote.channel` | Atlas repo to register with. |
| `pr-token` | `""` | Token with Contents+PR write on the **Atlas**. Blank → print the entry to paste. |
| `signer-key` | `""` | SSH private delivery-signer key (a secret) — the ownership proof. Blank → unsigned. |
| `identity` | `tell.yml` | Path in your repo to this Tell's identity. |
| `fingerprint` | `keys/tell.fpr` | Path in your repo to your published signer fingerprint. |
| `install-gh` | `true` | Apt-install `gh` on the runner. |

The bundled `bin/register` (`entry` / `branch` / `pr`) ships with the action; pin a tag/SHA
instead of `@main` for stability. Run `bin/register entry` locally to preview your entry, or
`bin/register branch` to see the `tell/<scope>/<id>` branch it will open the PR on.
