# `ingress` — run a Tell's whole inbound loop over your Issues

A composite GitHub Action that runs the entire pickup a Tell does over its workspace's
submission Issues, in order:

1. **collect** — read open submission Issues, authorize each against its QR token
   (`bin/collect-submissions` + `bin/authz`), stage the authorized ones.
2. **govern** — judge each staged answer against the delegated constitution
   (`bin/govern`, pre-seal, on plaintext — no key), attach the verdict, publish the
   transparency report.
3. **deliver** — seal the abiding answers into each pile's encrypted feed and publish it
   on your own `feed/**` branches (the bundled [`deliver`](../deliver) action).
4. **finalize** — label and close the mailbox (`ingested` / `rejected`).

Tell writes only its own repo: no GitHub App, no cross-repo token — only
`contents: write` + `issues: write` on the calling repo (the built-in `GITHUB_TOKEN`).

## Use it

This action is **trigger-agnostic** — *you* choose when it runs. The template
`ingest-submissions.yml` in this repo defaults to **manual dispatch** and leaves cron and
issue triggers as commented suggestions, so adopting it never silently spends Action
minutes. Fork or submodule this Tell, keep that workflow as your starting point, and edit
the cadence to your jurisdiction:

```yaml
name: ingest-submissions
on:
  workflow_dispatch:            # default: run by hand
  # schedule:
  #   - cron: "31 * * * *"      # ← uncomment + edit to pick replies up automatically
  # issues:
  #   types: [opened, reopened]
permissions:
  contents: write
  issues: write
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: ./.github/actions/ingress
        with:
          github-token:  ${{ github.token }}
          qr-secret:     ${{ secrets.TELL_QR_SECRET }}
          signer-key:    ${{ secrets.TELL_SIGNER_KEY }}
          seed-identity: ${{ secrets.TELL_SEED_IDENTITY }}
```

## Inputs

| Input | Default | What |
| --- | --- | --- |
| `github-token` | — (required) | Token for reading/closing Issues (`gh`). Pass `${{ github.token }}`. |
| `qr-secret` | — (required) | `TELL_QR_SECRET`; verifies each submission's QR token (a secret). |
| `seed-identity` | — (required) | `age` identity (a secret); resumes the per-pile ratchet across runs. |
| `signer-key` | `""` | SSH private signing key (a secret). Blank → unsigned (dev only). |
| `registry` | `_data/piles.yml` | Path to your pile registry. |
| `only-id` | `""` | Ingest/deliver to just one pile id. |
| `rollup` | `""` | Rollup command override; default is your `./bin/rollup`, else the bundled reference. |
| `source-name` | `tell` | Feed source name written into each manifest entry. |
| `constitutions-dir` | `constitutions` | Where `bin/govern` reads the delegated per-poll constitutions. |
| `publish-report` | `true` | Commit the govern transparency report to the current branch. |
| `install-age` | `true` | Apt-install `age` on the runner (for the deliver step). |

## Adoption model

Built for adopting the **whole Tell tree** — fork it, or submodule it into your workspace
so `bin/`, `.github/actions/`, `constitutions/`, and `_data/piles.yml` sit where the steps
expect them. The steps and the nested `deliver` use repo-root-relative paths, so this
composes cleanly in-repo and in a fork.

> Referencing the action **cross-repo** (`uses: OWNER/REPO/.github/actions/ingress@ref`)
> while keeping your own piles/constitutions is not wired yet: `bin/authz` and
> `bin/collect-submissions` still resolve `_data/piles.yml` relative to the bundled
> scripts, so they'd read this Tell's registry, not yours. Threading those data paths is a
> tracked follow-up (see `OPEN-QUESTIONS.md`). For now, adopt the whole tree.
