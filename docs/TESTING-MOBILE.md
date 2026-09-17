# Testing the mobile app

## Expo Go will not work, and it is not a setting

`react-native-passkey` is a native module with no config plugin. Expo Go ships a fixed set
of native modules and cannot load one it was not built with, so the app crashes on import
before any screen renders. There is no flag for this. A development build is the only way
to run this app at all.

Android is the realistic target. iOS needs a Mac or a paid Apple Developer account plus a
physical device, and this machine has neither Xcode nor an Apple team.

This machine also has no Android SDK, no Java and no `adb`, so the build happens in Expo's
cloud rather than locally. You are signed in as `miracle_codes`.

---

## The order matters

The passkey cannot work until the domain vouches for the app, and the file that does the
vouching needs a fingerprint that does not exist until the first build. So:

### 1. Build the development client

```
cd mobile
pnpm build:android
```

First run asks to generate an Android keystore. Say yes. EAS keeps it, and **that keystore
is now part of your app's identity**: the fingerprint below is derived from it, and
replacing it later invalidates every association file and every passkey bound through it.
Do not let EAS regenerate it casually.

The build takes roughly 10 to 20 minutes on the free tier, queue included. It produces an
APK and a download link.

### 2. Read the signing fingerprint

```
pnpm credentials
```

Choose Android, then the build credentials. Copy the **SHA-256 certificate fingerprint**,
which looks like `AB:CD:EF:...` with 32 colon-separated pairs.

### 3. Publish the association file

Create `web/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
    "target": {
      "namespace": "android_app",
      "package_name": "xyz.usehenad.app",
      "sha256_cert_fingerprints": ["<the SHA-256 from step 2>"]
    }
  }
]
```

Three things people get wrong here:

- The relation must include `get_login_creds`. Include `handle_all_urls` as well. On 15 Sep a
  file with only `get_login_creds` verified cleanly with Google, yet the phone still refused
  to create a passkey. Setups known to work carry both relations, plus the app-side link in
  `app.config.ts`: an `autoVerify` App Link for `/app` and `asset_statements` meta-data.
- **List every signing certificate you will ever use**: the EAS development keystore, and
  later the Play App Signing key. A build signed by a key not in this list silently fails
  to see the passkey rather than reporting an error.
- It must be served as JSON over HTTPS with no redirect. Push to main, Vercel deploys, then
  check it: `curl -sI https://usehenad.xyz/.well-known/assetlinks.json`

Verify Google can read it:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://usehenad.xyz&relation=delegate_permission/common.get_login_creds`

### 4. Install and run

Install the APK on an Android 9 or later phone with Google Password Manager. Then:

```
cd mobile
pnpm start
```

Scan the QR code with the development client, not with the Expo Go app.

---

## What to actually test, in order

**1. The passkey derives the same address as the web.**
This is the only test that matters. Create a passkey on usehenad.xyz in the phone's browser
first, then open the app and press "I already have a passkey". The address in the app must
equal the address on the web, character for character. If it does not, the two clients are
different products and everything built on top of them is wrong.

**2. Recovery.** Uninstall the app, reinstall, press "I already have a passkey" again. The
same address must come back from the passkey alone, with nothing in storage to help it.

**3. The quote.** Enter an amount and a recipient. The quote must match what the web app
shows for the same corridor and amount within the difference a few seconds of feed movement
explains. Both clients read the same endpoint, so a divergence here is a bug.

**4. Settlement** stays disabled until the mainnet contracts exist and their addresses are
in `app.config.ts` under `extra`. The button says so rather than being silently grey.

---

## Known failures and what they mean

| What you see | What it is |
| --- | --- |
| Crash on launch in Expo Go | Expected. Expo Go cannot load the passkey module. Use the dev build. |
| `PRF_UNAVAILABLE` | The authenticator has no PRF support. Use Google Password Manager on Android 9+. |
| `CRYPTO_UNAVAILABLE` | The polyfill in `index.ts` did not run first. Check nothing was reordered above it. |
| Passkey prompt never appears | `assetlinks.json` is missing, malformed, redirecting, or names the wrong fingerprint. Ask Google: its verifier names the exact fault. `ERROR_CODE_REDIRECT` means the bare domain redirects to `www`; make the bare domain primary in Vercel. |
| "RP ID cannot be validated" | Android does not trust this app for usehenad.xyz, even though Google's verifier may say the site is linked. Seen 15 Sep with a file granting only `get_login_creds` and an APK without the app-side link. Fixed in commit 1a35739 by adding `handle_all_urls` and the app-side link, the same as Veil, which creates passkeys on the same phone. Confirmed on a device on 17 Sep: the site change alone was not enough, and it took the new APK with the app-side link. Build APKs with the GitHub workflow `android-dev-build.yml`. |
| "Sign in another way" sheet, then "No passkey for usehenad.xyz" | Android's Credential Manager found no passkey for usehenad.xyz in this Google account (`NoCredentialException`). Passkeys are bound to their domain forever, so one made on `localhost` during web testing never appears here. Create one in the app with Continue with passkey, or on usehenad.xyz first. |
| App force-quits on launch | The JavaScript expects a native module the installed APK was built without. Compare what the APK contains against what autolinking now resolves; after adding any native dependency, rebuild with `pnpm build:android`. Seen 14 Sep with expo-splash-screen, react-native-reanimated and react-native-worklets. |
| Different address from the web | Stop. Do not ship. The derivation has drifted, and `packages/core/test/account.test.ts` should have caught it. |
| `Unable to resolve "@expo/metro-runtime/error-overlay"` | expo-router's **peer** dependencies were undeclared, so pnpm auto-installed the newest versions (SDK 57's) and hoisted them into `node_modules/.pnpm/node_modules`, where Metro looks. Fixed by pinning `@expo/metro-runtime`, `react-native-reanimated` and `react-native-worklets` to SDK 54 versions in `mobile/package.json`. After any dependency change, restart with `npx expo start -c` so Metro drops its cached resolution. |
| App icon is the Expo default | The icon is baked into the APK at build time. Changing `assets/` does nothing to an installed build; it needs a new `pnpm build:android`. |

---

## iOS, when you get there

Needs an Apple Developer Team ID, the Associated Domains capability on the App ID, and
`web/public/.well-known/apple-app-site-association` containing
`{"webcredentials":{"apps":["TEAMID.xyz.usehenad.app"]}}`, served as JSON with **no `.json`
extension**. iOS 18 or later only, because that is when PRF arrived in WebKit.

`app.config.ts` already declares `webcredentials:usehenad.xyz`, so `expo prebuild` writes
the entitlement without touching Xcode.
