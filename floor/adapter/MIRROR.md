# floor/adapter — the vendored consumer bootstrap (the glove)

The floor-as-adapter is a storage **consumer**: on a `/storage/.<adapter>` load it iframes the
engine's own canonical bottle, installs the client that bottle *delivers* over the wire, verifies
it against the pinned platform key, and drives it. That consumer bootstrap is vendored here so the
floor stays self-contained (three-files-plus-this, no fetches, "not smart enough to be attacked").

This is NOT the engine. Per the glove decision, a storage engine's own code (git-enough's git
internals) is never vendored into the floor — it arrives at runtime as signed blobs over `install`
and is dropped on reload. What IS vendored is only the floor's own consumer machinery: verify the
signed manifest, mount + import the entry, and the probe transport to talk to the bottle.

## Provenance & sync discipline

These files are byte-identical mirrors of `anecdote.channel/composer/` (the constellation's mirror
discipline — the same hand-sync that keeps `floor.mjs` storageRequest in step with
`composer/bottle-uri.mjs`). When the source changes, re-copy verbatim:

| here | source of truth |
| --- | --- |
| `anecdote.mjs`        | `composer/anecdote.mjs`        (byte-identical) |
| `sign.mjs`            | `composer/sign.mjs`            (byte-identical) |
| `install.mjs`         | `composer/install.mjs`         (byte-identical) |
| `install-loader.mjs`  | `composer/install-loader.mjs`  (byte-identical) |
| `bottle-uri.mjs`      | `composer/bottle-uri.mjs`      (byte-identical) |
| `open-engine.mjs`     | `composer/open-engine.mjs`     (byte-identical) |

`probe-client.mjs` is the one deliberate exception: it is the CONSUMER SUBSET of
`composer/probe-line.mjs` + `git-enough/bottle.mjs` embedBottle — constants, request/cancel,
`connectProbeLine`, `embedBottle`. It drops the powerful serve side (elevatedSession /
serveProbeLine / spawnChamber) and its authorize/consent import, because a consumer holds no gate
and so carries no gate code. Its wire shapes must stay byte-faithful to those two sources.

## No network surface

None of these reach the network. `sign.mjs` uses WebCrypto (`crypto.subtle`), `probe-client.mjs`
uses `MessageChannel` + `postMessage`, and the one outward surface is the iframe (`embedBottle`) —
exactly the sanctioned outward surface the floor doc already names. `test/floor.test.mjs` greps this
whole directory for a network surface and fails if one grows.
