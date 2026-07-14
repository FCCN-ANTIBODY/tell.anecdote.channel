// floor/pin.mjs — the floor's GLEBE KEY: the single root-of-trust the adapter seam verifies delivered engine
// clients against (passed to floor/adapter/open-engine as `platformKey`; composer/install verifyInstall). It
// is a public key fingerprint (key:sha256:… — composer/sign generateIdentity's `.fingerprint`), constant and
// public, baked into the built floor bytes.
//
// WHY "glebe". A storage engine is a powerless glove: it has no inherent authority. What it has is a GLEBE —
// the provisioned origin it was granted to occupy (git-enough.bottles.anecdote.channel). The floor trusts the
// client an engine delivers not because of the engine, but because of the OFFICE that granted it that land:
// the apex/constellation identity that provisioned `bottles` under the apex and signs each engine's install.
// The pin is that office. Trust is served-from-the-glebe (the floor iframes the canonical origin; if the
// DNS/cert resolve, the land is real — bottle-attest's domain anchor) AND signed-by-its-office (this key).
//
// It is NOT the tell node's own key (keys/tell.fpr is the DELIVERY signer — a different office, and one that
// never signs engine installs; pinning it would force every Tell to re-mint every engine, breaking the shared
// canonical `git-enough`). It is the GLEBE-holder: the apex provisioning identity the engines' installs are
// signed under.
//
// PER-APEX, not per-name — which is exactly why one constant floor works. Every *.tell.anecdote.channel floor
// and every *.bottles.anecdote.channel engine are co-tenants of one glebe (anecdote.channel), so they pin the
// same office; the pin is a build-time constant of the constellation, not a per-name runtime seam. A different
// apex is a different glebe, a different floor, a different pin.
//
// NULL until set. With no key the floor wires no `open` seam (floor/adapter/open-seam makeOpen returns null)
// and an adapter load reaches for nothing — the safe default. Set this to the apex glebe identity's
// fingerprint (the key an engine bottle's install manifests are signed under) and the adapter comes alive.
export const GLEBE_KEY = null;

export default GLEBE_KEY;
