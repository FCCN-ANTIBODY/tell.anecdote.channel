# Lifecycle: a Tell from bootstrap to a registry someone leaves

This note describes the **whole life of a Tell** — how it comes to hold its keys, how piles come to
stand behind it and an Atlas comes to list it, what its ingest rhythm looks like, and what it is when
nobody has joined it. It is **doc-only**; it names how the existing pieces compose — and, in the table
at the end, which pieces are **mirrors, scaffolds, or vestiges**, so duplication is checkable rather
than asserted. The form follows
[`data-pile/docs/lifecycle.md`](https://github.com/FCCN-ANTIBODY/data-pile/blob/main/docs/lifecycle.md).

## Chain of agency — principal, agent, law

The pile is the **principal**; the Tell is its **agent**; Atlas is the reporting-law layer above
([`CONTRACT.md`](../CONTRACT.md)). Every state below keeps that direction: the Tell holds no key that
reads a digest, publishes on its own domain, and never reaches into anyone's repo. A standalone Tell
publishes no public report — its one compulsory artifact is the Atlas-facing delivery it produces on
joining ([`reporting.md`](reporting.md)).

## The states

- **Bootstrapped.** The operator mints the Tell's own capabilities — signer, seed identity, QR secret
  (`bin/tell-bootstrap`), the boundary signer (`bin/boundary-bootstrap`), and the post credential
  (`bin/submit-bootstrap`) — each a capture-install-validate tool, because a PAT cannot be minted by a
  script. Placement per posture (Hosted / Computer / Mobile) is [`keys/README.md`](../keys/README.md).
- **Registered-with.** Piles come to stand behind the Tell by **PR-as-consent** onto
  `_data/piles.yml`; the merge is the consent, and the pile pins the Tell's signer fingerprint by hand,
  out of band ([`CONTRACT.md`](../CONTRACT.md) → "Registration"). The Tell in turn lists *itself* with
  an Atlas by the same gesture one tier up (`bin/register`, a `tell/<scope>/<id>` branch, a signed
  commit).
- **Answerable.** A poll exists when its delegated constitution does
  (`_data/constitutions/<pile>/<poll>.json`), its canonical Issue is open (`bin/open-poll`), and its QR
  is minted (`bin/qr`). The respondent-facing poll is **self-contained in its QR**, deliberately
  unbacked by a registry ([`per-poll-registry.md`](per-poll-registry.md)).
- **Ingesting.** The loop: `bin/collect-submissions` → `bin/authz` → `bin/govern` → `bin/deliver` →
  `bin/finalize-submissions`, publishing sealed chunks at `piles/<id>/feed/*` for the pile to pull.
  The producing cadence is deliberately **off by default** — the template's cron is a commented
  suggestion (┄ civic-node
  [`OPEN-QUESTIONS.md` §K](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/OPEN-QUESTIONS.md)).
- **Rotating.** The served chain (`piles/<id>/feed/*`) is append-only files; bounding its live size
  is an operator retention policy, deferred until it bites (the `prune-pile-history` action remains
  for workspaces that still hold branch-based feeds: archive intact, reset lean, never rewrite signed
  history). Staged submissions are intermediate; govern reports are the kept evidence locker.
- **Quiet.** A Tell with no registrants is **not a private Tell; it is a public Tell nobody has
  joined.** Addressability is its whole publicity — privacy is an empty registry, not a mode. What a
  quiet Tell is *for* — the first singleton beside which new ones are provisioned, like group chats —
  is the hosted-rework direction, civic-node
  [`docs/TENANCY.md`](https://github.com/FCCN-ANTIBODY/civic-node/blob/main/docs/TENANCY.md).

## The vestigial and the mirrored

The engine accretes parts faster than it retires them. This table is the checkable answer to "which
parts are load-bearing?" — statuses: **live** (wired and load-bearing today), **mirror** (a CI/server
twin of a gesture the offline origin performs natively), **retired** (kept for compatibility only),
**scaffold** (a seam awaiting its mechanism), **not load-bearing** (working, optional).

| Artifact | Status | Superseded / mirrored by | See |
| --- | --- | --- | --- |
| `bin/collect-submissions` · `authz` · `govern` · `deliver` · `finalize-submissions` | **live** | — (the recipient engine itself) | [`CONTRACT.md`](../CONTRACT.md) → Ingress |
| `index.md` (landing page) | **retired** to a thin verbatim forward | `anecdote.channel/poll.html` | [`answer-runtime.md`](answer-runtime.md) |
| composer-only rules in `assets/tell.css` | **retired** with the landing page | the runtime's own styles | [`answer-runtime.md`](answer-runtime.md) |
| `bin/qr` + `qr.yml` | **mirror** — the Computer twin | `anecdote …/composer/qr-mint.mjs` (byte-parity; an operator holding `TELL_QR_SECRET` runs author → mint → answer → host → tally with this repo minting nothing) | [`answer-runtime.md`](answer-runtime.md) |
| `workers/feed-gateway` | **retired** — feeds are plain static files in the served tree (`piles/<id>/feed/*`); Pages serves them, normal caching applies | GitHub Pages itself | [`CONTRACT.md`](../CONTRACT.md) → Direction |
| issue-per-response ingress (`mode=issue`) | **retired** — the comment paradigm is the paradigm; `bin/qr` refuses to mint it, the relay refuses to post it, and only the credential-free `issueUrl` fallback (the respondent's own click) still opens a fresh issue. Historical issues still sweep. | the canonical-issue comment thread (`bin/open-poll` + `--canonical`) | [`issue-ingress.md`](issue-ingress.md), [`sealed-credential.md`](sealed-credential.md) |
| `ingest-submissions.yml` cron / issues triggers | **scaffold** — commented by design | the coordinated deliver window | ┄ §K |
| `bin/judge` (`TELL_JUDGE_CMD`) · `bin/vouch` (`TELL_VOUCH_CMD`) | **scaffold** — honest-default seams | the summonable judge | ┄ §A |
| signed-QR trust roots beyond `TELL_SIGNERS` | **scaffold** — slices 3–4 unbuilt | the friend-list generalization | [`qr-provenance.md`](qr-provenance.md), ┄ §L |
| `widget/public.html` | **live** — a civic-node embed, unrelated to answering | — | [`answer-runtime.md`](answer-runtime.md) |

Which workflows are optional — and the end vision in which none of them run — is
[`keys/README.md`](../keys/README.md) → "Workflows are optional."
