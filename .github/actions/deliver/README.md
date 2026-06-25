# `deliver` — run your own Tell on your own dataset

A composite GitHub Action that turns **your** repository into its own Tell. It reads
your pile registry, runs your rollup over your jurisdiction's dataset, and produces +
encrypts + ratchet-keys + signs + publishes each pile's feed into your own repo —
which the piles then pull. No GitHub App, no cross-repo token: it needs only
`contents: write` on your repo (the built-in `GITHUB_TOKEN`).

## Use it

In your jurisdiction's repo, add `.github/workflows/deliver.yml`:

```yaml
name: deliver
on:
  workflow_dispatch:
  schedule:
    - cron: "47 * * * *"
permissions:
  contents: write
jobs:
  deliver:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: FCCN-ANTIBODY/tell.anecdote.channel/.github/actions/deliver@main
        with:
          signer-key:   ${{ secrets.TELL_SIGNER_KEY }}
          seed-identity: ${{ secrets.TELL_SEED_IDENTITY }}
```

Then:

1. **Keys.** Run `bin/tell-bootstrap` once (from the Tell repo, or copy it) to generate
   your delivery signer + seed identity and store them as the `TELL_SIGNER_KEY` and
   `TELL_SEED_IDENTITY` secrets. Publish your `keys/tell.fpr` so your piles can pin it.
2. **Registry.** List the piles you front in `_data/piles.yml` (`id`, `scope`, `feed`,
   `age_recipient`) — each pile's `handshake` PR appends its entry.
3. **Dataset.** Provide a `bin/rollup` that prints a pile's window digest
   (`bin/rollup <id> <scope>` → stdout; empty = nothing new). Until you do, the action's
   bundled reference rollup emits placeholder records so the pipeline runs end to end.

## Inputs

| Input | Default | What |
| --- | --- | --- |
| `signer-key` | `""` | SSH private signing key (a secret). Blank → unsigned (dev only). |
| `seed-identity` | — (required) | `age` identity (a secret); resumes the per-pile ratchet across runs. |
| `registry` | `_data/piles.yml` | Path to your pile registry. |
| `only-id` | `""` | Deliver to just one pile id. |
| `rollup` | `""` | Rollup command; default is your `./bin/rollup`, else the bundled reference. |
| `source-name` | `tell` | Feed source name written into each manifest entry. |
| `install-age` | `true` | Apt-install `age` on the runner. |

The action requires `actions/checkout` with `fetch-depth: 0` first (it reads and pushes
your `feed/**` branches). The producer scripts (`bin/deliver`, `bin/rollup`,
`bin/pile-lib.sh`) ship with the action; pin a tag/SHA instead of `@main` for stability.
