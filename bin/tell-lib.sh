#!/usr/bin/env bash
# Tell-specific helpers (QR authorization). Kept SEPARATE from bin/pile-lib.sh,
# which is the crypto core vendored byte-for-byte from data-pile and guarded by
# bin/check-pile-lib — do not add to that file. Source this one instead.
#
# Authorization model (see CONTRACT.md / CONSTITUTION.md):
#   k_pile = HMAC(TELL_QR_SECRET, "qr:"||id)         per-pile key, never stored
#   tok    = HMAC(k_pile, "tok:"||id||":"||round)    bearer "this poll is open" cap
# The master secret mints tokens; the QR only carries one. No one without the secret
# can forge a token for another pile/round.

# HMAC-SHA256(key, msg) -> lowercase hex.
tl_hmac() { # KEY MSG
  printf '%s' "$2" | openssl dgst -sha256 -hmac "$1" -r 2>/dev/null | cut -d' ' -f1
}
tl_pile_key() { # MASTER ID
  tl_hmac "$1" "qr:$2"
}
tl_token() { # MASTER ID ROUND
  tl_hmac "$(tl_pile_key "$1" "$2")" "tok:$2:$3"
}

# Constant-time-ish equality: compare sha256 digests of each side so the byte
# comparison runs over fixed-length, content-independent strings.
tl_eq() { # A B
  [ "$(printf '%s' "$1" | sha256sum)" = "$(printf '%s' "$2" | sha256sum)" ]
}

# Verify a token for (id, round) under MASTER. 0 = valid, 1 = invalid.
tl_verify() { # MASTER ID ROUND TOK
  printf '%s' "$4" | grep -Eq '^[0-9a-f]{64}$' || return 1
  tl_eq "$(tl_token "$1" "$2" "$3")" "$4"
}
