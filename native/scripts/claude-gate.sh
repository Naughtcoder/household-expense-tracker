#!/bin/bash
# Claude Code PreToolUse hook for Bash. Claude cannot skip this: the app runs
# it before every shell command and a non-zero exit (2) blocks the command.
#
# - A phone build (xcodebuild archive or export, gradlew assembleRelease,
#   build-demo.sh) needs scripts/release-check.sh to have passed for the
#   current commit and that kind of build.
# - A git push from the household tracker needs the website typecheck and
#   tests to pass, because a push deploys the website.
REPO=$(cd "$(dirname "$0")/../.." && pwd)
NATIVE="$REPO/native"
# Only what would actually run counts: quoted text and heredoc bodies are
# removed first, so a note or a commit message that names a build command
# does not trip the gate (9 Oct 2026: a memory note did).
cmd=$(python3 -c '
import json, re, sys
c = json.load(sys.stdin).get("tool_input", {}).get("command", "")
c = re.sub(r"<<-?\s*([\x27\"]?)(\w+)\1.*?^\s*\2\s*$", " ", c, flags=re.S | re.M)
c = re.sub(r"\x27[^\x27]*\x27|\"(?:\\.|[^\"\\])*\"", " ", c)
print(c)' 2>/dev/null)
[ -z "$cmd" ] && exit 0

need() {
  local kind=$1 head stamp
  head=$(git -C "$REPO" rev-parse HEAD 2>/dev/null)
  stamp=$(cat "$NATIVE/release/.passed-$kind" 2>/dev/null)
  if [ "$(echo "$stamp" | awk '{print $1" "$2}')" != "$kind $head" ]; then
    echo "Blocked by the release gate: run native/scripts/release-check.sh $kind first (it has not passed for commit ${head:0:7})." >&2
    exit 2
  fi
}

if echo "$cmd" | grep -q "build-demo.sh"; then
  plat=$(echo "$cmd" | grep -Eo "build-demo.sh (ios|android)" | awk '{print $2}')
  need "demo-${plat:-ios}"
elif echo "$cmd" | grep -Eq "xcodebuild\b.*(\barchive\b|-exportArchive)" && echo "$cmd" | grep -q "ATExpenseTracker\|AT[0-9]*.xcarchive"; then
  need ios
elif echo "$cmd" | grep -Eq "gradlew\b.*assembleRelease"; then
  need android
elif echo "$cmd" | grep -Eq "git (-C [^ ]*household-tracker[^ ]* )?push" && { echo "$cmd" | grep -q "household-tracker" || [ "$(pwd -P)" = "$REPO" ] || [[ "$(pwd -P)" == "$REPO"/* ]]; }; then
  if ! (cd "$REPO" && npx tsc --noEmit -p . >/dev/null 2>&1 && node --test test/*.test.ts 2>&1 | grep -q "^ℹ fail 0"); then
    echo "Blocked: the website typecheck or tests fail, and a push deploys the website. Fix them first." >&2
    exit 2
  fi
fi
exit 0
