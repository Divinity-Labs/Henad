import { HDKey } from '@scure/bip32'
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from '@category-labs/mera'
import { toViemAccount } from '@category-labs/mera/viem'
import { isAddress, type Address, type LocalAccount } from 'viem'
import { RpIdMismatchError, TOKENS, assertRpIdForChain, erc20Abi, type TokenInfo } from '@henad/core'
import { appChain, appChainId } from './chain'
import type { SourceAssetSymbol } from './corridors'

/**
 * The account layer: a Mera passkey is the only credential. The passkey's
 * WebAuthn PRF output (32 bytes, fixed by credential + rpId + salt) becomes a
 * BIP-39 mnemonic, and m/44'/60'/0'/0/0 is the payer's EOA on Monad. Nothing
 * secret is stored anywhere: localStorage keeps only which credential to pin,
 * and a fresh device signs in by picking a discoverable passkey
 * (docs/INTEGRATION-FACTS.md §12.1). Every function here runs in the browser.
 */

export const PASSKEY_STORAGE_KEY = 'henad.passkey'
const RP_NAME = 'Henad'
const ETH_PATH = "m/44'/60'/0'/0/0"

export type StoredPasskey = PasskeyCredentialMetadata

export interface MeraAccount {
  address: Address
  credentialId: string
  /** viem local account: EIP-712, EIP-191, transactions and 7702 authorizations, signed from the in-memory session */
  account: LocalAccount
  /** zeroes the session key; signing afterwards throws SESSION_ENDED */
  end(): void
}

/** Relying-party id: the configured production domain, else this host. A passkey is bound to it forever. */
export function rpId(): string {
  return process.env.NEXT_PUBLIC_MERA_RP_ID || window.location.hostname
}

export function loadStoredPasskey(): StoredPasskey | null {
  try {
    const raw = window.localStorage.getItem(PASSKEY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { credentialId, transports } = parsed as { credentialId?: unknown; transports?: unknown }
    if (typeof credentialId !== 'string' || credentialId.length === 0) return null
    const t = Array.isArray(transports) && transports.every((x): x is string => typeof x === 'string') ? transports : undefined
    return t ? { credentialId, transports: t } : { credentialId }
  } catch {
    return null
  }
}

function storePasskey(meta: StoredPasskey, address?: Address) {
  try {
    const prev = loadStoredAccount()
    window.localStorage.setItem(
      PASSKEY_STORAGE_KEY,
      JSON.stringify({
        credentialId: meta.credentialId,
        transports: meta.transports,
        // The public address only. The derived key is never written anywhere: it lives in
        // the Mera session for the life of the tab and dies with it. Keeping the address
        // is what lets a reload show you as signed in and read your balance without a
        // biometric prompt, while still demanding the passkey before anything is signed.
        address: address ?? (prev?.credentialId === meta.credentialId ? prev.address : undefined),
        rpId: rpId(),
      }),
    )
  } catch {
    // Blocked storage: the passkey still works, the next sign-in is just not pinned.
  }
}

/**
 * The address and credential of the last account signed in on this device, or null.
 *
 * Scoped to the current rpId, because a passkey is bound to its relying party forever
 * and an address derived under one host means nothing under another.
 */
export function loadStoredAccount(): { address: Address; credentialId: string } | null {
  try {
    const raw = window.localStorage.getItem(PASSKEY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { credentialId, address, rpId: storedRp } = parsed as { credentialId?: unknown; address?: unknown; rpId?: unknown }
    if (typeof credentialId !== 'string' || credentialId.length === 0) return null
    if (typeof address !== 'string' || !isAddress(address)) return null
    if (typeof storedRp === 'string' && storedRp !== rpId()) return null
    return { address, credentialId }
  } catch {
    return null
  }
}

function accountFromPrf(prfOutput: Uint8Array, credentialId: string): MeraAccount {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist))
  const root = HDKey.fromMasterSeed(seed)
  const node = root.derive(ETH_PATH)
  const privateKey = node.privateKey
  if (!privateKey) throw new Error('Key derivation produced no private key')
  const session = createSecp256k1SigningSession({ privateKey })
  // The session holds its own copy of the key; zero every intermediate we touched.
  prfOutput.fill(0)
  seed.fill(0)
  node.wipePrivateData()
  root.wipePrivateData()
  return {
    address: getEvmAddress(session.publicKey),
    credentialId,
    account: toViemAccount(session),
    end: () => session.end(),
  }
}

/**
 * "Continue with passkey". Creates a passkey the first time; if this device
 * already holds one, signs in pinned to it instead of minting a second account
 * the user would not be able to tell apart.
 */
export async function continueWithPasskey(): Promise<MeraAccount> {
  const stored = loadStoredPasskey()
  return stored ? signInWithPasskey(stored) : createPasskeyAccount()
}

export async function createPasskeyAccount(): Promise<MeraAccount> {
  const id = rpId()
  assertRpIdForChain(appChainId(), id)
  const created = await createPasskeyWithPrfOutput({
    rp: { id, name: RP_NAME },
    user: { name: `henad · ${new Date().toISOString().slice(0, 10)}`, displayName: 'Henad account' },
  })
  const account = accountFromPrf(created.prfOutput, created.credentialId)
  storePasskey({ credentialId: created.credentialId, transports: created.transports }, account.address)
  return account
}

/**
 * Sign-in ceremony. Without `credential` the browser lists every discoverable
 * passkey for this rpId, which is how a fresh device recovers the same account.
 */
export async function signInWithPasskey(credential?: StoredPasskey): Promise<MeraAccount> {
  const id = rpId()
  assertRpIdForChain(appChainId(), id)
  const asserted = await getPasskeyPrfOutput({ rpId: id, ...(credential ? { credential } : {}) })
  const account = accountFromPrf(asserted.prfOutput, asserted.credentialId)
  storePasskey(credential?.credentialId === asserted.credentialId ? credential : { credentialId: asserted.credentialId }, account.address)
  return account
}

/**
 * Re-derive the session for the account already stored on this device.
 *
 * A reload throws away the signing session, deliberately, because the key is never
 * written down. It does not throw away who you are: `loadStoredAccount` still knows the
 * address, so the interface can show you signed in and read your balance. This is the
 * ceremony that gets the key back, and it runs at the moment something must be signed
 * rather than on arrival, which is where a user expects to be asked.
 *
 * The derived address is checked against the stored one. A mismatch means a different
 * passkey answered the prompt, which would silently sign from an account the screen is
 * not showing, so it fails loudly instead.
 */
export async function unlockStoredAccount(): Promise<MeraAccount> {
  const stored = loadStoredAccount()
  if (!stored) throw new Error('No account on this device. Sign in with your passkey.')
  const account = await signInWithPasskey({ credentialId: stored.credentialId })
  if (account.address.toLowerCase() !== stored.address.toLowerCase()) {
    account.end()
    throw new Error('That passkey belongs to a different account from the one on screen. Reload and sign in again.')
  }
  return account
}

/** Plain-language failure copy. Says what happened and what to do next. */
export function describeAccountError(e: unknown): string {
  if (e instanceof RpIdMismatchError) return e.message
  if (isMeraError(e)) {
    switch (e.code) {
      case 'PRF_UNAVAILABLE':
        return (
          'This passkey cannot derive an account: its provider does not support the WebAuthn PRF extension. ' +
          'Use Google Password Manager (Android, or Chrome 132+ signed in), iCloud Keychain on iOS 18+, 1Password, or a YubiKey 5.2+. ' +
          'Chrome’s local-profile passkeys, Bitwarden and Dashlane do not support PRF yet.'
        )
      case 'PASSKEY_OPERATION_FAILED':
        return 'The passkey prompt did not complete. Passkeys need HTTPS or localhost; try again and approve the prompt.'
      case 'CRYPTO_UNAVAILABLE':
        return 'This browser has no secure random source, so it cannot create a passkey.'
      default:
        return e.message
    }
  }
  return e instanceof Error ? e.message : 'The passkey step failed. Try again.'
}

/** The source asset on the chain the app settles on: testnet AUSD 0xa901…22dC, mainnet AUSD 0x0000…012a. */
export function sourceToken(symbol: SourceAssetSymbol): TokenInfo {
  const token: TokenInfo | undefined = TOKENS[appChainId()][symbol]
  if (!token) throw new Error(`${symbol} is not deployed on chain ${appChainId()}`)
  return token
}

export async function readBalance(address: Address, symbol: SourceAssetSymbol): Promise<bigint> {
  const token = sourceToken(symbol)
  return appChain().readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
}
