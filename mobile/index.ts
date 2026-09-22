/**
 * App entry.
 *
 * The polyfill below must run before anything imports the passkey library, which is why
 * this file exists at all rather than pointing `main` straight at `expo-router/entry`.
 * Hermes ships no `crypto.getRandomValues`, and mera needs it for the WebAuthn challenge
 * and the credential's user handle; without it, account creation throws
 * `CRYPTO_UNAVAILABLE` on the first tap, on a real device, after the biometric prompt.
 *
 * Import order in this file is load-bearing. Do not let a formatter sort it.
 */
import { getRandomValues } from 'expo-crypto'

if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  })
}

import 'expo-router/entry'

// The rate watch's background task has to be defined here, at the bundle's entry, and not
// only in the screen that uses it. When Android wakes Henad to run the task there is no UI:
// Expo Router loads route files lazily, on first render, so a definition that lives in a
// route is never evaluated and the job wakes up with no code to run. It then never finishes,
// never reschedules, and the watch goes silent after the app closes, which is exactly what
// it did.
import './src/lib/rate-watch'
