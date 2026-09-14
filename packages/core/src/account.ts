import { HDKey } from '@scure/bip32'
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/**
 * Deriving the account key from a passkey.
 *
 * This lives in the shared package, and is tested against a fixed vector, for one
 * reason: the web app and the mobile app must derive the *same* private key from the
 * same passkey, or the same person signing in on their phone gets a different address
 * and cannot see their own money. Nothing warns you when that happens. The two clients
 * would simply be different products wearing the same name.
 *
 * Every input to this function is part of the address:
 *
 *   - the 32 PRF bytes, which the authenticator computes from (credential, salt) and
 *     which WebAuthn specifies as platform-independent
 *   - the BIP-39 English wordlist
 *   - the empty BIP-39 passphrase, which `mnemonicToSeedSync` uses when none is given
 *   - the derivation path below
 *
 * Change any of them and every existing account becomes unreachable. There is no
 * migration, because the passkey cannot be made to produce different bytes.
 */
export const ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0"

/**
 * 32 bytes of WebAuthn PRF output to a secp256k1 private key.
 *
 * @param prfOutput Exactly 32 bytes from the authenticator. **Zeroed before return**,
 *   whether or not the derivation succeeds: the caller has no further use for it, and
 *   it is equivalent to the private key.
 * @returns The 32-byte private key. The caller owns it and should hand it straight to a
 *   signing session rather than keeping it.
 */
export function privateKeyFromPrfOutput(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length !== 32) {
    prfOutput.fill(0)
    throw new Error(`PRF output must be 32 bytes, got ${prfOutput.length}`)
  }
  let seed: Uint8Array | undefined
  let root: HDKey | undefined
  let node: HDKey | undefined
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist))
    root = HDKey.fromMasterSeed(seed)
    node = root.derive(ETH_DERIVATION_PATH)
    const privateKey = node.privateKey
    if (!privateKey) throw new Error('Key derivation produced no private key')
    return Uint8Array.from(privateKey)
  } finally {
    // Wipe every intermediate, in reverse order of sensitivity. The PRF output and the
    // seed each reconstruct the key on their own.
    node?.wipePrivateData()
    root?.wipePrivateData()
    seed?.fill(0)
    prfOutput.fill(0)
  }
}
