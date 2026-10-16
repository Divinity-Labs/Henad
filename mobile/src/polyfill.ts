/**
 * Hermes ships no `crypto.getRandomValues`. This puts expo-crypto's in its place, and it has to
 * be the first module the bundle evaluates.
 *
 * It lives in its own file because a statement in index.ts cannot run first: every `import` in
 * a module is evaluated before any of the module's own code, so a polyfill written between two
 * imports still runs after both. That was harmless while only mera needed randomness, because
 * mera reads `globalThis.crypto` when it is called. @noble/hashes, under viem's
 * generatePrivateKey, reads it once, when it is first imported, and keeps what it found; it found
 * nothing, and making a claim link failed with "crypto.getRandomValues must be defined".
 * Imported first, this module runs before anything that could read `crypto`.
 */
import { getRandomValues } from 'expo-crypto'

if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  })
}
