# Contributing

Pull requests welcome. The project is small and the bar for "good code" is "the diff makes the codebase smaller, clearer, or both".

## Local development

```bash
npm install
npx expo prebuild --platform ios --clean    # or --platform android
npx expo start --dev-client
```

You will need:

- Your own Hedera test account (testnet works fine, get HBAR at <https://portal.hedera.com>)
- A Tangem card with an Ed25519 SLIP-0010 wallet
- For iOS: an Apple Developer Program membership (NFC entitlement gating)

Edit `src/config.ts` with your accounts and Tangem-derived public keys before running. The `isConfigured()` guard prevents the mint button from being clickable while placeholders are still in place.

## Pull requests

- Run `npm run type-check` before opening a PR.
- Keep the diff focused — one feature or fix per PR.
- New dependencies: please justify them in the PR body (bundle size, alternatives considered).
- Match the existing code style: `tsx`, no semicolons-vs-semicolons drift, no formatter config — just keep new code visually consistent with the file you're editing.
- UI changes: include a screenshot or short screen recording.

## Things we'd love help with

- Android testing (CI hasn't seen Android yet)
- App icon + splash design (ideally provided as SVG so we can generate the rest)
- Settings UI to move `src/config.ts` values into AsyncStorage
- Mint/burn/transfer/freeze/wipe operations on existing tokens
- Mirror-node-backed portfolio view

## Reporting issues

Please include:

- Device + OS version
- App version (`expo-cli --version` and `git rev-parse HEAD`)
- Network (mainnet / testnet)
- Tangem card type
- The exact transaction error (or screenshot of the in-app error banner)

## Security

If you find a vulnerability, please open a private security advisory on GitHub rather than a public issue.
