// plugins/with-tangem-modulemap-fix.js
//
// Expo Config Plugin — persists a Podfile post_install hook that adds
// SWIFT_INCLUDE_PATHS for the TangemSdk modulemap directory, so the
// `TangemSdk_secp256k1` [system] module resolves cleanly during compile.
//
// Why: the upstream Tangem iOS SDK (3.x onwards) declares secp256k1 helpers
// as a separate `[system]` module via its module.modulemap. When CocoaPods
// integrates the Pod into an app workspace, Xcode/Swift cannot find that
// modulemap unless its directory is in SWIFT_INCLUDE_PATHS. Without this,
// `xcodebuild` fails with:
//   error: unable to resolve module dependency: 'TangemSdk_secp256k1'
//
// This plugin appends a post_install hook to the generated Podfile.
// Re-runs automatically on every `expo prebuild --clean`.
//
// Reference: linked to PR #23 on XRPL-Labs/tangem-sdk-react-native + the
// patches/ file (which pins TangemSdk to 3.9.0 to avoid the same issue).

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const HOOK_MARKER = '# === TangemSdk modulemap fix (with-tangem-modulemap-fix) ===';
const HOOK_BODY = `
    ${HOOK_MARKER}
    installer.pods_project.targets.each do |target|
      if ['RNTangemSdk', 'TangemSdk'].include?(target.name)
        target.build_configurations.each do |config|
          existing = config.build_settings['SWIFT_INCLUDE_PATHS'] || '$(inherited)'
          tangem_path = '$(PODS_ROOT)/TangemSdk/TangemSdk/TangemSdk'
          unless existing.include?(tangem_path)
            config.build_settings['SWIFT_INCLUDE_PATHS'] = "#{existing} #{tangem_path}"
          end
        end
      end
    end
    # === end TangemSdk modulemap fix ===`;

const withTangemModulemapFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'Podfile',
      );

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Idempotent — bail if marker already present
      if (podfile.includes(HOOK_MARKER)) {
        return modConfig;
      }

      // CocoaPods disallows multiple `post_install` blocks per Podfile.
      // We inject our body INTO the existing react_native_post_install hook,
      // just after the `react_native_post_install(...)` call.
      //
      // Strategy: find the closing `)` of `react_native_post_install(...)` and
      // insert our hook body right after it (still inside the surrounding
      // `post_install do |installer| ... end` block).
      const rnPostInstallRegex =
        /(react_native_post_install\([\s\S]*?\)\s*\n)/;

      if (!rnPostInstallRegex.test(podfile)) {
        throw new Error(
          '[with-tangem-modulemap-fix] Could not locate `react_native_post_install(...)` ' +
            'call in Podfile. Did the Expo Podfile template change?',
        );
      }

      podfile = podfile.replace(
        rnPostInstallRegex,
        (match) => match + HOOK_BODY + '\n',
      );

      fs.writeFileSync(podfilePath, podfile, 'utf8');
      // eslint-disable-next-line no-console
      console.log(
        '[with-tangem-modulemap-fix] Injected SWIFT_INCLUDE_PATHS hook into existing post_install.',
      );

      return modConfig;
    },
  ]);
};

module.exports = withTangemModulemapFix;
