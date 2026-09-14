import type { ExpoConfig } from 'expo/config'

/**
 * The passkey domain is the whole configuration problem.
 *
 * A passkey binds forever to its relying-party id. On the web that can fall back to the
 * hostname the browser is on; a native app has no hostname, so the value must be supplied
 * explicitly and must match the web app byte for byte, or the same passkey derives a
 * different account and the person finds an empty wallet on their phone.
 *
 * It is read from `extra` at runtime rather than inlined, so a build for a staging domain
 * cannot silently inherit production's.
 *
 * Before this works on a device, usehenad.xyz must serve two association files, both as
 * JSON with no redirect (docs/YOUR-LIST.md item 8):
 *   /.well-known/apple-app-site-association  — needs the Apple Team ID
 *   /.well-known/assetlinks.json             — needs every Android signing fingerprint
 * Without them the OS refuses to let this app assert that rpId at all.
 */
const RP_ID = 'usehenad.xyz'
const BUNDLE_ID = 'xyz.usehenad.app'

const config: ExpoConfig = {
  name: 'Henad',
  slug: 'henad',
  scheme: 'henad',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // No newArchEnabled and no edgeToEdgeEnabled: SDK 57 removed both keys because the New
  // Architecture and edge-to-edge are mandatory now and cannot be turned off.
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    // Expo writes the Associated Domains entitlement from this during prebuild.
    associatedDomains: [`webcredentials:${RP_ID}`],
  },
  android: {
    package: BUNDLE_ID,
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: { typedRoutes: true },
  extra: {
    rpId: RP_ID,
    rpName: 'Henad',
    /** Monad testnet until the mainnet contracts are deployed; see docs/DEPLOY.md. */
    chainId: 10143,
  },
}

export default config
