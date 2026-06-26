# Vendored verbatim from FCCN-ANTIBODY/data-pile bin/lib.sh — DO NOT EDIT HERE.
# Producer (Tell) and consumer (data-pile) MUST share these primitives byte-for-byte;
# bin/check-pile-lib verifies this copy still matches the data-pile source.
#
#!/usr/bin/env bash
# Shared helpers for the data-pile toolbox. Source this; don't run it.
#
# Crypto primitives (kept deliberately small, near-zero deps: age, openssl, jq, sha256sum):
#   ratchet:   K_{n+1} = sha256("ratchet:" || K_n)        one-way; forward-only disclosure
#   commit:    ratchet_pub = sha256("pub:" || K_n)        published-safe commitment to K_n
#   block iv:  iv = sha256("iv:" || K_n)[:16]             unique per block (each block has its own key)
#   block enc: aes-256-ctr under K_n                      integrity comes from the signed manifest
#
# All keys are 64-hex-char (32-byte) strings.

set -euo pipefail

dp_sha256_str() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
dp_sha256_file() { sha256sum "$1" | cut -d' ' -f1; }

dp_ratchet_next() { dp_sha256_str "ratchet:$1"; }
dp_ratchet_pub()  { dp_sha256_str "pub:$1"; }
dp_iv()           { dp_sha256_str "iv:$1" | cut -c1-32; }

dp_enc() { # KHEX IN OUT
  openssl enc -aes-256-ctr -K "$1" -iv "$(dp_iv "$1")" -in "$2" -out "$3"
}
dp_dec() { # KHEX IN OUT  (OUT="-" for stdout)
  if [ "$3" = "-" ]; then
    openssl enc -d -aes-256-ctr -K "$1" -iv "$(dp_iv "$1")" -in "$2"
  else
    openssl enc -d -aes-256-ctr -K "$1" -iv "$(dp_iv "$1")" -in "$2" -out "$3"
  fi
}

# Canonical serialization of the manifest entries array -> the digest the head signs.
dp_entries_digest() { # MANIFEST_FILE
  jq -cS '.entries' "$1" | tr -d '\n' | sha256sum | cut -d' ' -f1
}

dp_die() { echo "data-pile: $*" >&2; exit 1; }
dp_log() { echo "data-pile: $*" >&2; }

# Resolve the feed branch for a source from pile.yml (no YAML dep: grep the simple shape).
dp_source_branch() { # SOURCE_NAME PILE_YML
  awk -v s="$1" '
    $1=="-" && $2=="name:" { cur=$3 }
    cur==s && $1=="branch:" { print $2; exit }
  ' "$2"
}
dp_source_signer() { # SOURCE_NAME PILE_YML
  awk -v s="$1" '
    $1=="-" && $2=="name:" { cur=$3 }
    cur==s && $1=="signer:" { gsub(/"/,"",$2); print $2; exit }
  ' "$2"
}
# The Tell gateway base URL this pile PULLS the source's encrypted feed from.
dp_source_url() { # SOURCE_NAME PILE_YML
  awk -v s="$1" '
    $1=="-" && $2=="name:" { cur=$3 }
    cur==s && $1=="url:" { gsub(/"/,"",$2); print $2; exit }
  ' "$2"
}
