#!/usr/bin/env bash
# Test bin/judge-via-judgement's TRANSFORM against a STUB engine. The real judgement/bin/judge is
# exercised in the judgement repo; this proves the ADAPTER's own responsibility: the Tell seam
# {record, constitution} maps to judgement's {constitution_a, constitution_b, subject, guidance};
# the verdict maps back and `confidence` is dropped; and the honest default (needs-judgment) holds
# whenever the engine is absent or misbehaves. Runs fully offline, no judgement checkout required.
#
#   test/judge-via-judgement.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }
adapter="$root/bin/judge-via-judgement"
[ -x "$adapter" ] || fail "bin/judge-via-judgement is not executable"

# A stub engine: captures what it received (so we can assert the input map) and returns a
# verdict+reason+confidence (so we can assert the output map).
export STUB_CAPTURE="$work/capture.json"
cat > "$work/stub" <<'EOF'
#!/usr/bin/env bash
cat > "$STUB_CAPTURE"
jq -n '{verdict:"accept", reason:"stub ok", confidence:0.9}'
EOF
chmod +x "$work/stub"

seam='{"record":{"answer":"a jpg of my dog","id":"r1"},"constitution":{"type":"open","guidance":"a dog photo, not a joke","text":"Can I have a picture of your dog?"}}'

# 1. input map: subject <- record.answer, guidance <- constitution.guidance, A=B=the constitution.
out="$(printf '%s' "$seam" | JUDGEMENT_JUDGE="$work/stub" "$adapter")"
cap="$(cat "$STUB_CAPTURE")"
[ "$(jq -r '.subject' <<<"$cap")" = "a jpg of my dog" ] || fail "subject not mapped from record.answer"
[ "$(jq -r '.guidance' <<<"$cap")" = "a dog photo, not a joke" ] || fail "guidance not mapped from constitution.guidance"
[ "$(jq -r '.constitution_a.text | fromjson | .text' <<<"$cap")" = "Can I have a picture of your dog?" ] || fail "constitution_a is not the poll constitution"
[ "$(jq -r '.constitution_a.text' <<<"$cap")" = "$(jq -r '.constitution_b.text' <<<"$cap")" ] || fail "A and B are not identical (the one-constitution case)"
[ "$(jq -r '.context.caller' <<<"$cap")" = "tell" ] || fail "context.caller not stamped"
ok "seam {record,constitution} maps to judgement {A=B, subject, guidance, context}"

# 2. output map: verdict + reason pass through; confidence is dropped.
[ "$(jq -r '.verdict' <<<"$out")" = "accept" ] || fail "verdict not passed through"
[ "$(jq -r '.reason' <<<"$out")" = "stub ok" ] || fail "reason not passed through"
[ "$(jq -r 'has("confidence")' <<<"$out")" = "false" ] || fail "confidence was not dropped"
ok "output {verdict,reason,confidence} maps back to {verdict,reason}"

# 3. honest default: the engine is absent -> needs-judgment (never a faked accept).
out2="$(printf '%s' "$seam" | JUDGEMENT_JUDGE="$work/does-not-exist" "$adapter")"
[ "$(jq -r '.verdict' <<<"$out2")" = "needs-judgment" ] || fail "absent engine should degrade to needs-judgment"
ok "absent engine -> needs-judgment (honest default preserved)"

# 4. the engine returns non-verdict junk -> needs-judgment.
cat > "$work/junk" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null; echo "not json at all"
EOF
chmod +x "$work/junk"
out3="$(printf '%s' "$seam" | JUDGEMENT_JUDGE="$work/junk" "$adapter")"
[ "$(jq -r '.verdict' <<<"$out3")" = "needs-judgment" ] || fail "junk engine output should degrade to needs-judgment"
ok "engine returning no verdict -> needs-judgment"

# 5. a rejecting verdict passes through faithfully (not forced to needs-judgment).
cat > "$work/rej" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null; jq -n '{verdict:"reject", reason:"off-topic", confidence:0.8}'
EOF
chmod +x "$work/rej"
out4="$(printf '%s' "$seam" | JUDGEMENT_JUDGE="$work/rej" "$adapter")"
[ "$(jq -r '.verdict' <<<"$out4")" = "reject" ] && [ "$(jq -r '.reason' <<<"$out4")" = "off-topic" ] || fail "a real reject must pass through"
ok "a reject verdict passes through unchanged"

# 6. LIVE: if the .judge-engine submodule is checked out, drive the adapter against the REAL
# judgement/bin/judge. Without agent credentials the engine honestly returns needs-judgment — so we
# assert only that the plumbing yields a VALID verdict and drops confidence (the real end-to-end path).
if [ -f "$root/.judge-engine/bin/judge" ]; then
  live="$(printf '%s' "$seam" | JUDGEMENT_JUDGE="$root/.judge-engine/bin/judge" "$adapter")"
  lv="$(jq -r '.verdict' <<<"$live")"
  case "$lv" in
    accept|reject|needs-judgment) ok "real engine via .judge-engine submodule returns a valid verdict ($lv)";;
    *) fail "real engine returned an invalid verdict: $lv";;
  esac
  [ "$(jq -r 'has("confidence")' <<<"$live")" = "false" ] || fail "confidence not dropped on the real engine path"
else
  echo "  (skip: .judge-engine submodule not checked out — live engine test skipped)"
fi

echo "all judge-via-judgement tests passed"
