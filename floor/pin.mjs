// floor/pin.mjs — the floor's PINNED PLATFORM KEY: the ANECDOTE platform identity, the single root-of-trust
// the adapter seam verifies delivered bottle clients against (passed to floor/adapter/open-engine as
// `platformKey`; composer/install verifyInstall). It is a public key fingerprint (key:sha256:… — composer/sign
// generateIdentity's `.fingerprint`), constant and public, baked into the built floor bytes.
//
// This is NOT a new key. It is the identity composer/sign already mints and that install / bottle-attest
// already expect — the one the operator holds on-device (keys/README "Mobile"). Anecdote signs it because
// Anecdote is the one LOADING MODULES: it is the root of trust for code that runs, in EVERY bottle — the
// Tell-adjacent pile floors on *.tell.anecdote.channel AND the free-form bottles on bottles.anecdote.channel
// (arbitrary cubbies: user data, code blocks, engines like git-enough). One identity, uniform across all.
//
// It is NOT the Tell node's key. Tell's office is COLLECTION — it is the instrument that gathers poll answers
// into antidote, and keys/tell.fpr is its delivery signer. Signing the pile floors felt Tell-ish only because
// those floors sit on Tell's subdomain; it never generalized to the free-form bottles, which are not Tell's to
// vouch for. Anecdote, the module loader, signs every bottle instead — so there is one office, not two.
//
// PER-APEX, not per-name — which is why one constant floor works. Every *.tell and *.bottles origin under one
// apex trusts the same Anecdote identity, so the pin is a build-time constant of the constellation, not a
// per-name runtime seam. A different apex is a different platform identity, floor, and pin.
//
// NULL until set. With no key the floor wires no `open` seam (floor/adapter/open-seam makeOpen returns null)
// and an adapter load reaches for nothing — the safe default. Set this to the Anecdote platform identity's
// fingerprint (the key a bottle's install manifests are signed under) and the adapter comes alive.
export const PLATFORM_KEY = null;

export default PLATFORM_KEY;
