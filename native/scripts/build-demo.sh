#!/bin/bash
# Builds the demo app (made-up data, see src/lib/demo) without touching the
# real app's ios/ and android/ folders: the project is copied to a work
# folder, prebuilt there with EXPO_PUBLIC_VARIANT=demo, and built.
#
#   scripts/build-demo.sh ios 3        archive iOS build 3 and upload it to TestFlight
#   scripts/build-demo.sh ios 3 --no-upload
#   scripts/build-demo.sh android 3    an APK, copied to native/Expense-Tracker-Demo-3.apk
#
# Build only when Alex asks for a demo build; not with every real build.
set -euo pipefail
PLATFORM=${1:?ios or android}
BUILD=${2:?build number}
UPLOAD=${3:-}
HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=${DEMO_WORK:-$HOME/Library/Caches/household-demo-build}

mkdir -p "$WORK/native"
# The shared code the app imports as @lib sits next to native/.
ln -sfn "$HERE/../lib" "$WORK/lib"
rsync -a --delete --exclude ios --exclude android --exclude node_modules --exclude '*.apk' --exclude .expo --exclude '.env*' "$HERE/" "$WORK/native/"
ln -sfn "$HERE/node_modules" "$WORK/native/node_modules"
cd "$WORK/native"
export EXPO_PUBLIC_VARIANT=demo DEMO_BUILD=$BUILD LANG=en_US.UTF-8

if [ "$PLATFORM" = ios ]; then
  npx expo prebuild --platform ios --clean --no-install
  (cd ios && pod install)
  WS=$(ls -d ios/*.xcworkspace | head -1); SCHEME=$(basename "$WS" .xcworkspace)
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release -destination 'generic/platform=iOS' \
    -archivePath "$WORK/Demo-$BUILD.xcarchive" archive -allowProvisioningUpdates | tail -3
  if [ "$UPLOAD" != --no-upload ]; then
    cat > "$WORK/export.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>YOUR_TEAM_ID</string>
<key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST
    xcodebuild -exportArchive -archivePath "$WORK/Demo-$BUILD.xcarchive" -exportOptionsPlist "$WORK/export.plist" \
      -exportPath "$WORK/export-$BUILD" -allowProvisioningUpdates | tail -3
  fi
else
  npx expo prebuild --platform android --clean --no-install
  # prebuild resets this, and the release build runs out of memory without it.
  sed -i '' 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=1g/' android/gradle.properties
  J=$(/opt/homebrew/bin/brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
  (cd android && ANDROID_HOME=/opt/homebrew/share/android-commandlinetools JAVA_HOME=$J PATH=$J/bin:$PATH ./gradlew assembleRelease -q)
  cp android/app/build/outputs/apk/release/app-release.apk "$HERE/Expense-Tracker-Demo-$BUILD.apk"
  echo "APK: $HERE/Expense-Tracker-Demo-$BUILD.apk"
fi
