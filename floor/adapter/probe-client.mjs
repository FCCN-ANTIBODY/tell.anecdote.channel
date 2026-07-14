// floor/adapter/probe-client.mjs — the CONSUMER half of the probe transport, focused for the floor.
//
// The floor-as-adapter is a powerless CLIENT: it iframes an engine bottle and asks. So this vendors only the
// consumer subset of anecdote.channel/composer/probe-line.mjs + git-enough/bottle.mjs embedBottle — the
// message constants, the request/cancel builders, connectProbeLine (the client), and embedBottle (iframe a
// bottle by URL and get a connected client). It deliberately DROPS the powerful serve side (elevatedSession /
// serveProbeLine / spawnChamber) and its authorize/consent import: a consumer holds no gate, so it carries no
// gate code. The wire shapes here must stay byte-faithful to the source (see floor/adapter/MIRROR.md).
//
// The one outward surface stays the iframe (floor doc: "The one outward surface is the iframe") — there is no
// fetch here; the port is a MessageChannel, the hello is postMessage.

// Handshake (window.postMessage, before the port exists — the inverted hello):
export const READY = "probe.line.ready/v1"; // bottle -> us: booted, awaiting my port
export const INIT = "probe.line.init/v1"; // us -> bottle: here is your port (transferred)
// Over the transferred port:
export const FRAME = "probe.line.frame/v1";
export const CANCEL = "probe.line.cancel/v1";
export const CANCELLED = "probe.line.cancelled/v1";
export const ERROR = "probe.line.error/v1";
export const REQUEST = "probe.line.request/v1";

export function request({ id, op, input = null, behavior, scope, confirmed = false } = {}) {
  if (!id) throw new Error("probe-client: a request needs a correlation id");
  if (!op) throw new Error("probe-client: a request needs an op");
  return { type: REQUEST, id, op, input, behavior, scope, confirmed };
}
export function cancel({ id } = {}) {
  if (!id) throw new Error("probe-client: cancel needs the request id");
  return { type: CANCEL, id };
}

// CLIENT: a fluent client over the port we received on {type:INIT}. Correlates frames back to their request
// by id; resolves { frames, grantId } on the final frame, rejects on error. Byte-faithful to probe-line's
// connectProbeLine.
export function connectProbeLine(port, { newId } = {}) {
  const streams = new Map();
  let counter = 0;
  const mkId = newId || (() => "r" + (++counter));
  port.onmessage = (event) => {
    const d = event.data; if (!d || !d.id) return;
    const st = streams.get(d.id); if (!st) return;
    if (d.type === FRAME && d.final) { streams.delete(d.id); st.resolve({ frames: st.frames, grantId: d.grantId }); }
    else if (d.type === FRAME) { st.frames.push(d); st.onFrame && st.onFrame(d); }
    else if (d.type === CANCELLED) { streams.delete(d.id); st.resolve({ frames: st.frames, cancelled: true }); }
    else if (d.type === ERROR) { streams.delete(d.id); st.reject(Object.assign(new Error(d.reason), { needsConfirm: d.needsConfirm, rung: d.rung })); }
  };
  port.start && port.start();
  function invoke(op, input, opts = {}) {
    const id = opts.id || mkId();
    return new Promise((resolve, reject) => {
      streams.set(id, { frames: [], onFrame: opts.onFrame, resolve, reject });
      port.postMessage(request({ id, op, input, behavior: opts.behavior, scope: opts.scope, confirmed: opts.confirmed }));
    });
  }
  const abort = (id) => port.postMessage(cancel({ id }));
  return { invoke, cancel: abort };
}

// PARENT (client) side: iframe a bottle by URL, wait for its READY, hand it a private MessagePort, and return
// a connected probe client. Byte-faithful to git-enough/bottle.mjs embedBottle — a bottle serves whoever
// holds its port; the consent that decides WHAT runs rides in each request. Returns { client, iframe, teardown }.
export function embedBottle(url, { document: doc = globalThis.document, targetWindow = globalThis, mount = null, sandbox = null } = {}) {
  const iframe = doc.createElement("iframe");
  if (sandbox) iframe.setAttribute("sandbox", sandbox);
  iframe.src = url;
  (mount || doc.body).appendChild(iframe);
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    const onReady = (event) => {
      if (event.source !== iframe.contentWindow || !event.data || event.data.type !== READY) return;
      targetWindow.removeEventListener("message", onReady);
      iframe.contentWindow.postMessage({ type: INIT }, "*", [channel.port2]); // transfer the capability
      resolve({
        client: connectProbeLine(channel.port1),
        iframe,
        teardown: () => { try { channel.port1.close(); } catch {} iframe.remove(); },
      });
    };
    targetWindow.addEventListener("message", onReady);
  });
}
