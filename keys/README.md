# Tell delivery-signer material (public only)

Tell signs every inbound digest manifest it produces (`bin/deliver`) with an
ordinary **SSH signing key** — `ssh-keygen -Y sign`, the same primitive the
outbound side already uses for `pile/**` commits. There is **no GitHub App**: a
pile trusts Tell by pinning this public key, and the pile's `bin/verify` checks
each delivery against it. The handoff can be confirmed out-of-band / IRL.

## Files (committed; all public)

| File | Purpose |
| --- | --- |
| `tell.pub` | Tell's public delivery-signing key |
| `tell.signers` | One allowed-signers line (`tell <key>`) — a pile copies this verbatim into its own `keys/tell.signers` |
| `tell.fpr` | `SHA256:…` fingerprint a pile pins in `pile.yml` `signer:` |

The **private** key never lives here. It exists only as the repo secret
`TELL_SIGNER_KEY`, materialized to a temp file for the single signing call in
`deliver.yml`.

## One-time operator setup

One command does all of it — generate both keys, store the private halves as repo
secrets, publish the public signer material, and commit it:

```sh
bin/tell-bootstrap            # needs gh authenticated for this repo
git push                       # publish the committed public signer material
```

`bin/tell-bootstrap` generates the SSH signer + the `age` seed identity, sets the
`TELL_SIGNER_KEY` and `TELL_SEED_IDENTITY` secrets via `gh`, writes the three
public files below via `bin/publish-signer`, and commits them — private halves live
only in a `umask 077` temp dir and are shredded on exit. It refuses to clobber an
existing signer unless `--force` (rotation makes every pile re-pin). On a box without
`gh`, run `bin/tell-bootstrap --no-secrets`: it prints the two secret values once so
you can set them by hand.

Equivalent manual steps, if you'd rather:

```sh
ssh-keygen -t ed25519 -C tell-delivery-signer -f tell-signer   # private + .pub
gh secret set TELL_SIGNER_KEY < tell-signer                    # private -> CI secret
age-keygen -o tell-seed.identity                                # the ratchet-resume identity
gh secret set TELL_SEED_IDENTITY < tell-seed.identity          # private -> CI secret
bin/publish-signer tell-signer.pub                              # writes the 3 files above
git add keys/tell.pub keys/tell.signers keys/tell.fpr && git commit && git push
shred -u tell-signer tell-seed.identity                        # keep only the .pub + secrets
```

The `TELL_SEED_IDENTITY` `age` identity has no public half worth committing. It lets
Tell resume the per-pile ratchet across deliveries without per-pile secrets; see
`bin/deliver`.

## What a pile owner does

1. Copy `tell.signers` here into the pile's `keys/tell.signers`.
2. Pin `tell.fpr`'s value into the pile's `pile.yml` `sources[].signer`.
3. Confirm the fingerprint over a second channel (in person, signed message, …).

That's the entire trust establishment — no installation, no privileged token.
