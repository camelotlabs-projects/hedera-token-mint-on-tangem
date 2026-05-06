#!/usr/bin/env bash
#
# Patch the Tangem iOS SDK to always reduce NFC restart polling on iOS 17+.
#
# The vendored TangemSdk only enables this code path on a hardcoded list
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
MARKER="iOS 18/26 introduced NFC restart polling regressions"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run pod install from ios/ first." >&2
  exit 1
fi

if grep -q "$MARKER" "$FILE"; then
  echo "OK: already patched."
  exit 0
fi

# Insert a comment line and rewrite the conditional to drop the device check.
/usr/bin/sed -i.bak \
  -e 's|/// Starting from iOS 17 is no longer possible to invoke restart polling after 20 seconds from first connection on some devices|&\
    /// Patch: iOS 18\/26 introduced NFC restart polling regressions on all devices, so always reduce on iOS 17+.|' \
  -e 's|if #available(iOS 17, \*), NFCUtils.isBrokenRestartPollingDevice {|if #available(iOS 17, *) {|' \
  "$FILE"

if grep -q "$MARKER" "$FILE" && grep -q "if #available(iOS 17, \*) {" "$FILE"; then
  rm "$FILE.bak"
  echo "OK: patched $FILE"
else
  mv "$FILE.bak" "$FILE"
  echo "ERROR: patch failed, file restored. SDK source may have changed upstream." >&2
  exit 1
fi
