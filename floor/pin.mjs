// floor/pin.mjs — the floor's PINNED PLATFORM KEY: the single root-of-trust the adapter seam verifies
// delivered engine clients against (composer/install verifyInstall's `platformKey`). It is a public key
// fingerprint (key:sha256:… — composer/sign generateIdentity's `.fingerprint`), constant and public, baked
// into the built floor bytes. There is no per-name provisioning, so this is a build-time constant, not a
// runtime seam.
//
// NULL until set. With no pin the floor wires no `open` seam (floor/adapter/open-seam makeOpen returns null)
// and an adapter load reaches for nothing — the safe default. Set this to the platform key a bottle's install
// manifests are signed under, and the adapter comes alive.
//
// OPEN DECISION (do not guess): which key this is. bottle-attest frames the platform key as "the user's own
// anecdote key" (per-user root of trust), yet the floor is one constant site masked onto every name — so the
// pin is either the tell node's own anecdote identity (this repo is a sovereign node) or a distinct anecdote
// platform key. That choice is a trust decision for the operator; until it is made, this stays null and the
// adapter stays inert.
export const PLATFORM_KEY = null;

export default PLATFORM_KEY;
