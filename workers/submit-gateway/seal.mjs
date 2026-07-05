// The SEAL (docs/sealed-credential.md): an asker's own token, AEAD-encrypted under the Tell's
// sealing secret TOGETHER WITH ITS BINDING, handed back as ciphertext to travel in the poll's
// routing. No token database anywhere — the storage is the artifact. WebCrypto AES-256-GCM so
// the same module runs in the worker, in bin/seal-credential, and in tests.
//
// Wire form: sc1.<b64url iv>.<b64url ciphertext>   Plaintext: JSON { token, repo, issue,
// pile, poll, minted_at } — the binding the worker refuses on before the token is ever used.
const te = new TextEncoder(), td = new TextDecoder();
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function importKey(secret) {
  const raw = unb64u(secret);
  if (raw.length !== 32) throw new Error("seal: TELL_SEAL_KEY must be 32 bytes (base64url)");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function mintKey() {
  return b64u(crypto.getRandomValues(new Uint8Array(32)));
}

export async function seal(binding, secret) {
  for (const k of ["token", "repo", "issue", "pile", "poll"]) if (!binding[k]) throw new Error("seal: binding needs " + k);
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: te.encode("sc1") }, key, te.encode(JSON.stringify(binding))));
  return `sc1.${b64u(iv)}.${b64u(ct)}`;
}

// Returns the binding, or null — a foreign/tampered cipher is noise, never an error to act on.
export async function unseal(sc, secret) {
  try {
    const [tag, iv, ct] = String(sc).split(".");
    if (tag !== "sc1") return null;
    const key = await importKey(secret);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64u(iv), additionalData: te.encode("sc1") }, key, unb64u(ct));
    return JSON.parse(td.decode(new Uint8Array(pt)));
  } catch {
    return null;
  }
}
