import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
/**
 * Point the app at the local mainnet fork instead of a public chain.
 *
 * Set HENAD_LOCAL_FORK_HOST to this computer's LAN address when starting Metro, with
 * scripts/local-fork.sh run with LAN=1 and the web dev server up. The phone then reads the
 * fork's node and settles through the laptop's /api/relay, with the contract addresses the
 * script wrote into web/.env.local. `extra` is served by Metro, so no APK rebuild is needed.
 * Debug builds allow the plain-http traffic this uses; a release build would refuse it.
 */
function localForkExtra(): Record<string, unknown> | null {
  const host = process.env.HENAD_LOCAL_FORK_HOST?.trim()
  if (!host) return null
  const envFile = join(__dirname, '..', 'web', '.env.local')
  if (!existsSync(envFile)) throw new Error(`HENAD_LOCAL_FORK_HOST is set but ${envFile} does not exist. Run scripts/local-fork.sh first.`)
  const env = Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  )
  return {
    localFork: true,
    chainId: 143,
    rpcUrl: `http://${host}:8545`,
    apiBaseUrl: `http://${host}:3000`,
    corridorRouter: env.NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS ?? '',
    rateAttestation: env.NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS ?? '',
    deployedAtBlock: Number(env.NEXT_PUBLIC_DEPLOYED_AT_BLOCK ?? 0),
  }
}

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
    // Scanning a recipient's address QR. Photos and audio are never used, so the
    // microphone permission is not requested at all.
    [
      'expo-camera',
      {
        cameraPermission: "Henad uses the camera to scan a recipient's wallet address QR code.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
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
    /** Monad mainnet: the contracts are live there since 18 Sep 2026 (packages/core HENAD). */
    chainId: 143,
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
    ...localForkExtra(),
  },
}

export default withAssetStatements(config, RP_ID)
