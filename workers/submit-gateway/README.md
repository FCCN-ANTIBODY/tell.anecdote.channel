# submit-gateway — the credential-shielding relay

The Tell's own Cloudflare Worker at **`POST <tell-domain>/submit`**. It holds the Tell's POST
credential (`TELL_POST_TOKEN`, the `bin/submit-bootstrap` PAT) as a **worker secret** and relays
the answer runtime's GitHub-API-shaped request with the credential injected server-side. The QR
then carries only a non-secret address (`submit=`, minted by `bin/qr --submit-url`), never a token —
this is the graduated form of the QR-embedded credential
([`docs/submission-credential.md`](../../docs/submission-credential.md)).

## The posture, stated

- **First secret-bearing worker in the constellation.** The feed/piles gateways are stateless
  projections; this one holds a credential. Its blast radius equals the PAT's — and the path
  allowlist in `worker.js` narrows it further to **comments on one already-public repo's
  canonical poll issues**, defense in depth on top of GitHub's own scope boundary. The relay
  never creates an issue: `mode=issue` is retired
  ([`docs/sealed-credential.md`](../../docs/sealed-credential.md) → "What it forces, usefully");
  the credential-free `issueUrl` fallback never comes here at all.
- **Per-Tell custody.** This worker is the Tell's own, holding only its own credential — the
  central-apex jar stays rejected. A workspace hosting several Tells deploys one per Tell.
- **A relay, not a gatekeeper.** It holds no `TELL_QR_SECRET` and performs no admission: the
  credential still only lets a reply *knock*; `tok` still decides admission at ingest
  (`bin/authz`). When the summonable judge lands (civic-node `OPEN-QUESTIONS.md` §A), this is
  where it gets **summoned** — over the `{verdict, reason}` contract — never where anything is
  decided.

## Deploy (one-time)

```sh
cd workers/submit-gateway
wrangler deploy                       # CLOUDFLARE_ACCOUNT_ID or `wrangler login`
wrangler secret put TELL_POST_TOKEN   # paste the bin/submit-bootstrap PAT
```

The Tell's domain must be proxied (orange-cloud) for the route to intercept. Then mint QRs with
the address instead of the credential:

```sh
n=$(bin/open-poll --pile cd04-q1 --poll budget --question "How should we spend it?")
bin/qr --pile cd04-q1 --poll budget --canonical "$n" --submit-url https://tell.anecdote.channel/submit
# (or export TELL_SUBMIT_URL; TELL_POST_TOKEN is NOT embedded when the URL is set)
```

## Smoke test

```sh
curl -s -X POST https://tell.anecdote.channel/submit \
  -H 'Content-Type: application/json' \
  -d '{"path":"/repos/FCCN-ANTIBODY/tell.anecdote.channel/issues/7/comments","body":{"body":"relay smoke"}}'
# → 201 {"html_url": "...", "id": N}   (403 path-not-allowed for anything off the comment threads)
```

Rotation: revoke/re-mint the PAT (`bin/submit-bootstrap`), `wrangler secret put` the new one.
Printed QRs keep working — `su` is dropped from the signed canon (`tl_qr_canon`), so neither the
worker moving nor the credential rotating re-mints anything.
