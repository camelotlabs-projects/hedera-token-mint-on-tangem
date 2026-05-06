#!/usr/bin/env bash
#
# Patch the Tangem iOS SDK to always reduce NFC restart polling on iOS 17+.
#
# The vendored TangemSdk (3.1.0) only enables this code path on a hardcoded list
# of "broken" devices, but iOS 17 / 18 / 26 all exhibit the same NFC restart
# polling regression on every device we've tested. Without this patch you'll
# see "Incomplete process. To finalize the operation, kindly tap the card again"
# in the middle of any multi-step flow.
#
# Run this script after every `pod install`. Idempotent — exits cleanly if the
# file already matches the patched form.
#
set -euo pipefail

FILE="ios/Pods/TangemSdk/TangemSdk/TangemSdk/Common/NFC/NFCReader.swift"

if [ ! -f "$FILE" ]; then
  echo "❌ $FILE not found. Run \`pod install\` from ios/ first." >&2
  exit 1
fi

if grep -q "iOS 18/26 introduced NFC restart polling regressions" "$FILE"; then
  echo "✓ Already patched."
  exit 0
fi

# In-place replace the conditional that gates shouldReduceRestartPolling.
/usr/bin/perl -0777 -i.bak -pe '
  s{
    (///\s+Starting\ from\ iOS\ 17\ is\ no\ longer.*?\n)
    (\s*private\ lazy\ var\ shouldReduceRestartPolling:\ Bool\ =\ \{\n)
    \s*if\ \#available\(iOS\ 17,\ \*\),\ NFCUtils\.isBrokenRestartPollingDevice\ \{\n
  }{$1    /// Patch: iOS 18/26 introduced NFC restart polling regressions on all devices, so always reduce on iOS 17+.\n$2        if #available(iOS 17, *) {\n}sx
' "$FILE"

if grep -q "iOS 18/26 introduced NFC restart polling regressions" "$FILE"; then
  rm "$FILE.bak"
  echo "✓ Patched $FILE"
else
  mv "$FILE.bak" "$FILE"
  echo "❌ Patch failed — file restored from backup. SDK source may have changed upstream." >&2
  exit 1
fi
