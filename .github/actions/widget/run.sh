#!/usr/bin/env bash
# Resolve the CALLING workspace's node identity, then render the data-filled Tell
# widget fragment into the workspace with bin/widget. Reads identity from the
# workspace the same way the register action reads tell.yml — the bundled bin/widget
# is the CODE; the node's atlas.yml is the DATA — so any node that drops this in
# renders ITS OWN locator QR, never the template's.
#
# Fails closed: with no identity file and no explicit atlas/scope it refuses rather
# than render the wrong node (mirrors the register action's contract).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
widget="$here/../../../bin/widget"   # bundled CODE, location-independent of the call site
[ -f "$widget" ] || { echo "widget: bundled bin/widget not found at $widget" >&2; exit 1; }

atlas_yml="${ATLAS_YML:-atlas.yml}"
atlas="${ATLAS_MONIKER:-}"
scope="${SCOPE:-}"

# Pull a top-level scalar from a flat YAML identity file: strips an inline # comment,
# surrounding quotes, and whitespace. Good enough for atlas.yml's id:/scope: lines and
# avoids requiring a YAML runtime in the action.
yval() { # FILE KEY
  awk -F':[[:space:]]*' -v k="$2" '$1==k{v=$2; sub(/[[:space:]]*#.*/,"",v); gsub(/["\x27]/,"",v); gsub(/[[:space:]]/,"",v); print v; exit}' "$1"
}

if [ -z "$atlas" ] || [ -z "$scope" ]; then
  [ -f "$atlas_yml" ] || {
    echo "widget: no $atlas_yml in the workspace and atlas/scope not provided — refusing to render the wrong node" >&2
    exit 1
  }
  [ -z "$atlas" ] && atlas="$(yval "$atlas_yml" id)"
  [ -z "$scope" ] && scope="$(yval "$atlas_yml" scope)"
fi
[ -n "$atlas" ] && [ -n "$scope" ] || { echo "widget: could not resolve atlas/scope from $atlas_yml" >&2; exit 1; }

tell="${TELL_MONIKER:-tell}"
hub="${HUB:-https://tell.anecdote.channel}"
out="${OUT:-_includes/widgets/tell.html}"

bash "$widget" --atlas "$atlas" --scope "$scope" --tell "$tell" --hub "$hub" --out "$out"
echo "widget: rendered $tell.$atlas.$scope into $out" >&2
