import type { ExpoConfig } from 'expo/config'
import { AndroidConfig, withAndroidManifest, withStringsXml, type ConfigPlugin } from 'expo/config-plugins'

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

/**
 * The app's half of the Android domain link: the site vouches for the app in assetlinks.json,
 * and this points the app back at that file.
 *
 * On 15 Sep the site half alone verified with Google's own API and still left the phone
 * refusing to create a passkey ("RP ID cannot be validated"). The setups known to work carry
 * both halves plus a verified App Link, so this one does too (react-native-passkey#68, Google's
 * seamless-credential-sharing codelab, and the author's own Veil app on the same phone).
 *
 * The quotes are backslash-escaped because Android's resource compiler strips bare double
 * quotes from string resources, which would leave the value as invalid JSON.
 */
const withAssetStatements: ConfigPlugin<string> = (cfg, domain) => {
  const value = `[{\\"include\\": \\"https://${domain}/.well-known/assetlinks.json\\"}]`
  cfg = withStringsXml(cfg, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'asset_statements', translatable: 'false' }, _: value }],
      c.modResults,
    )
    return c
  })
  return withAndroidManifest(cfg, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults)
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'asset_statements', '@string/asset_statements', 'resource')
    return c
  })
}

const config: ExpoConfig = {
  name: 'Henad',
  slug: 'henad',
  scheme: 'henad',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Rendered by mobile/scripts/render-icons.ps1 from the geometry of web/src/app/icon.svg,
  // in Instrument Sans SemiBold, so the phone and the browser tab carry the same mark.
  // The icon is baked into the APK: changing these files needs a new build.
  icon: './assets/icon.png',
  // SDK 54 still allows the choice; SDK 55 onward makes it mandatory. Turned on here so
  // the app is already running what a later upgrade will force, rather than discovering
  // New Architecture problems during the upgrade.
  newArchEnabled: true,
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    // Expo writes the Associated Domains entitlement from this during prebuild.
    associatedDomains: [`webcredentials:${RP_ID}`],
  },
  android: {
    package: BUNDLE_ID,
    // The launcher masks this to a circle or squircle of its choosing, so the torn receipt
    // edge cannot survive here. The H and the purple bar sit inside the safe zone on ink.
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0E091C',
    },
    edgeToEdgeEnabled: true,
    // A verified App Link makes Android check assetlinks.json against this build's signing
    // certificate at install, which is how the domain trust is established on the phone.
    // One narrow path, /app, so receipt and rates links keep opening in the browser.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: RP_ID, pathPrefix: '/app' }],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // The launch screen is the first thing the app shows; left unset it shows Expo's mark.
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#fbfbfc' }],
  ],
  // No `updates` or `runtimeVersion`: expo-updates is not installed and over-the-air
  // updates are not wanted here. A dev build loads JS from the Metro server on your
  // machine, and shipping a second update channel would only be a way to run code nobody
  // reviewed on a device holding real accounts.
  experiments: { typedRoutes: true },
  owner: 'miracle_codes',
  extra: {
    /**
     * EAS could not write this itself: a TypeScript config is code, not data, so the CLI
     * refuses to rewrite it. Set by hand from the project EAS created.
     */
    eas: { projectId: 'b127e143-4325-421b-9d12-a9da111d8304' },
    rpId: RP_ID,
    rpName: 'Henad',
    /** Monad testnet until the mainnet contracts are deployed; see docs/DEPLOY.md. */
    chainId: 10143,
    /**
     * The phone signs; the server quotes and broadcasts. The reference rate must come
     * from the same place for both clients or their receipts disagree, and the relayer
     * key will never ship inside an app bundle.
     */
    apiBaseUrl: `https://${RP_ID}`,
    /** Filled in at the mainnet deploy, from contracts/deployments/143.json. */
    corridorRouter: '',
    rateAttestation: '',
    deployedAtBlock: 0,
  },
}

export default withAssetStatements(config, RP_ID)
