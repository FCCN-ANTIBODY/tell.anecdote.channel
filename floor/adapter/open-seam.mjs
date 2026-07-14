// floor/adapter/open-seam.mjs — builds the floor's `open({ url, adapter })` seam (the one floor.mjs
// mountAdapter injects). The seam iframes the engine bottle, installs the client it delivers, verifies that
// client against the floor's pinned platform key, and wears it — embed → hello → install → verify → drive.
//
// The pin is the floor's ROOT OF TRUST. With no pin, makeOpen returns null: floor.mjs then wires no seam and
// the adapter reaches for nothing (the safe default, exactly like an unprovisioned bottle). Nothing platform
// -unsigned can ever mount, because verify runs against this pin before the entry imports.
//
// `embed` defaults to the real iframe transport (probe-client embedBottle); it is injected in tests so the
// mount/install/verify CONTRACT is exercised without a browser (the real Blob-URL import + cross-origin port
// are Chromium-verified in the anecdote.channel suite).

import { openEngine } from "./open-engine.mjs";
import { embedBottle } from "./probe-client.mjs";

// Returns a function `open({ url, adapter }) -> { engine, opened }` or null (no pin). `opened` is a promise
// resolving to openEngine's { client, module, revoke, teardown } — the driven storage client and its
// teardown. mountAdapter calls `open` synchronously and holds the handle; a consumer awaits handle.opened.
export function makeOpen({ platformKey, embed = embedBottle, document: doc, mount, loadOpts } = {}) {
  if (!platformKey) return null;
  return ({ url }) => {
    const embedded = embed(url, doc ? { document: doc, mount } : undefined);
    const opened = Promise.resolve(embedded).then((e) =>
      openEngine(e.client, { platformKey, loadOpts }).then(
        (o) => ({ ...o, teardown: e.teardown }),
        (err) => { try { e.teardown && e.teardown(); } catch {} throw err; },
      ),
    );
    return { engine: url, opened };
  };
}

export default makeOpen;
