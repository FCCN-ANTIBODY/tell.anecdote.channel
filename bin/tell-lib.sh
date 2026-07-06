#!/usr/bin/env bash
# Tell-specific helpers (QR authorization). Kept SEPARATE from bin/pile-lib.sh,
# which is the crypto core vendored byte-for-byte from data-pile and guarded by
# bin/check-pile-lib — do not add to that file. Source this one instead.
#
# Authorization model (see CONTRACT.md / CONSTITUTION.md):
#   k_pile = HMAC(TELL_QR_SECRET, "qr:"||id)                 per-pile key, never stored
#   tok    = HMAC(k_pile, "tok:"||id||":"||poll||":"||round) binds {pile, poll, round}
# The master secret mints tokens; the QR only carries one. No one without the secret
# can forge a token, and a token minted for one (pile, poll, round) does not verify as
# any other — so a QR can't be retargeted to a different poll. `type` and `asker` ride
# along as unbound routing metadata (carried to the pile, not pinned by the token).

# HMAC-SHA256(key, msg) -> lowercase hex.
tl_hmac() { # KEY MSG
  printf '%s' "$2" | openssl dgst -sha256 -hmac "$1" -r 2>/dev/null | cut -d' ' -f1
}
tl_pile_key() { # MASTER ID
  tl_hmac "$1" "qr:$2"
}
tl_token() { # MASTER ID POLL ROUND
  tl_hmac "$(tl_pile_key "$1" "$2")" "tok:$2:$3:$4"
}

# Constant-time-ish equality: compare sha256 digests of each side so the byte
# comparison runs over fixed-length, content-independent strings.
tl_eq() { # A B
  [ "$(printf '%s' "$1" | sha256sum)" = "$(printf '%s' "$2" | sha256sum)" ]
}

# Verify a token for (id, poll, round) under MASTER. 0 = valid, 1 = invalid.
tl_verify() { # MASTER ID POLL ROUND TOK
  printf '%s' "$5" | grep -Eq '^[0-9a-f]{64}$' || return 1
  tl_eq "$(tl_token "$1" "$2" "$3" "$4")" "$5"
}

# --- QR provenance (asymmetric signature over the exact poll payload) -----------------
# The token above is symmetric authorization — it admits a reply into THIS Tell's mailbox
# and only this Tell can verify it. The signature is the orthogonal half: it proves a QR's
# ORIGIN and INTEGRITY to anyone holding the signer's public key, registry-free, so a
# shared/foreign poll can be judged "worth processing at all" off-node. bin/qr signs and a
# verifier (bin/authz/bin/verify) checks the SAME asymmetric primitive bin/deliver uses
# (ssh-keygen -Y), under this distinct namespace so a delivery signature can never be
# replayed as a poll one. See docs/qr-provenance.md.
TL_QR_SIG_NS="tell-poll"

# Canonical signing preimage. Reads the QR's payload as "key=value" lines on stdin (values
# URL-encoded exactly as they ride in the URL — robust to newlines / & / =), drops the
# signature metadata (`sig`, `kid` are never self-signed), the `post` credential (a
# semi-public, rotatable GitHub write token that must never be part of the provenance
# preimage — see bin/qr / docs/issue-ingress.md), the `submit` submit-gateway address (a
# non-secret transport hint that must rotate as freely as the credential it replaces —
# see workers/submit-gateway), and the `sealed` credential (the AEAD `sc1.` bundle, opaque
# and per-recipient), and emits them sorted by key so signer and verifier agree
# regardless of URL param order. Both sides pipe through this — this set is byte-identical
# to anecdote.channel's composer/qr-mint.mjs qrCanon; the two MUST move together.
tl_qr_canon() {
  grep -vE '^(sig|kid|post|submit|sealed)=' | LC_ALL=C sort
}
