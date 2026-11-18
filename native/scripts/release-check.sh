#!/bin/bash
# The release gate. Must pass before any phone build; the Claude Code hook
# (scripts/claude-gate.sh) refuses archive, assembleRelease and build-demo.sh
# until it has, for the exact commit being built.
#
#   scripts/release-check.sh ios|android|demo-ios|demo-android
#
# Checks: everything committed, website and phone typechecks, all tests,
# a build number higher than the last one shipped, the native projects agree
# with app.json, and (Android) the signing key is the one Sam's phone
# already trusts, so an update installs over the old app instead of forcing
# an uninstall that wipes her payment readers (what happened on 8 Oct 2026).
set -uo pipefail
KIND=${1:?ios, android, demo-ios or demo-android}
NATIVE=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(cd "$NATIVE/.." && pwd)
FAIL=0
ok()   { echo "  ok    $1"; }
bad()  { echo "  FAIL  $1"; FAIL=1; }

echo "Release check: $KIND"

# 1. Nothing uncommitted, so the build is exactly a commit GitHub has checked.
dirty=$(git -C "$REPO" status --porcelain -- app lib native/src native/app.json native/app.config.js native/assets test)
[ -z "$dirty" ] && ok "everything committed" || bad "uncommitted changes:\n$dirty"

# 2. Typechecks and tests.
(cd "$REPO" && npx tsc --noEmit -p . >/dev/null 2>&1) && ok "website typecheck" || bad "website typecheck"
(cd "$NATIVE" && npx tsc --noEmit >/dev/null 2>&1) && ok "phone typecheck" || bad "phone typecheck"
tests=$(cd "$REPO" && node --test test/*.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' ')
echo "$tests" | grep -q "fail 0" && ok "tests ($tests)" || bad "tests ($tests)"

# 3. Build number moves forward.
num=$(node -e "
  const a=require('$NATIVE/app.json').expo
  const k='$KIND'
  if (k==='ios') console.log(a.ios.buildNumber)
  else if (k==='android') console.log(a.android.versionCode)
  else console.log(process.env.DEMO_BUILD||'')")
last=$(node -e "console.log((require('$NATIVE/release/last-builds.json')['$KIND']||{}).build||0)")
lastsha=$(node -e "console.log((require('$NATIVE/release/last-builds.json')['$KIND']||{}).sha||'')")
head=$(git -C "$REPO" rev-parse HEAD)
if [ -z "$num" ]; then bad "no build number (for a demo build, set DEMO_BUILD)"
elif [ "$num" -gt "$last" ] || { [ "$num" -eq "$last" ] && [ "$lastsha" = "$head" ]; }; then ok "build number $num (last shipped $last)"
else bad "build number $num is not higher than the last one shipped ($last)"; fi

# 4. The native projects agree with app.json (real app only; demo is prebuilt fresh).
if [ "$KIND" = ios ] && [ -f "$NATIVE/ios/ATExpenseTracker/Info.plist" ]; then
  plist=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$NATIVE/ios/ATExpenseTracker/Info.plist")
  [ "$plist" = "$num" ] && ok "Info.plist build $plist" || bad "Info.plist says build $plist, app.json says $num"
fi
if [ "$KIND" = android ]; then
  gradle=$(grep -Eo 'versionCode [0-9]+' "$NATIVE/android/app/build.gradle" | awk '{print $2}')
  [ "$gradle" = "$num" ] && ok "build.gradle versionCode $gradle" || bad "build.gradle says $gradle, app.json says $num"
fi

# 5. Android signing key unchanged.
if [ "$KIND" = android ] || [ "$KIND" = demo-android ]; then
  J=$(/opt/homebrew/bin/brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
  ks="$NATIVE/android/app/debug.keystore"
  fp=$("$J/bin/keytool" -list -v -keystore "$ks" -storepass android 2>/dev/null | grep -i "SHA256:" | head -1 | awk '{print $2}')
  pin=$(cat "$NATIVE/release/android-signing-sha256.txt")
  [ "$fp" = "$pin" ] && ok "Android signing key matches the pinned one" \
    || bad "Android signing key changed ($fp). Restore ~/.household-tracker/android-signing.keystore to android/app/debug.keystore"
fi

if [ "$FAIL" = 0 ]; then
  echo "$KIND $head $(date +%s)" > "$NATIVE/release/.passed-$KIND"
  node -e "
    const f='$NATIVE/release/last-builds.json', j=require(f)
    j['$KIND']={ build: Number('$num'), sha: '$head' }
    require('fs').writeFileSync(f, JSON.stringify(j, null, 2)+'\n')"
  echo "PASSED. Building $KIND $num from ${head:0:7} is allowed."
else
  echo "Release check FAILED. Fix the above before building."; exit 1
fi
