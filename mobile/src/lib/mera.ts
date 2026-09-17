import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from '@category-labs/mera'
import { reactNativeWebAuthnClient } from '@category-labs/mera/react-native-webauthn-client'
import { toViemAccount } from '@category-labs/mera/viem'
import * as SecureStore from 'expo-secure-store'
import { isAddress, type Address, type LocalAccount } from 'viem'
import { RpIdMismatchError, assertRpIdForChain, privateKeyFromPrfOutput } from '@henad/core'
import { appChainId, rpId, rpName } from './config'

/**
 * The account layer, native side.
 *
 * This is the web client with one substitution: `reactNativeWebAuthnClient` in place of
 * the browser default, which swaps `navigator.credentials` for the platform passkey APIs.
 * Everything downstream of the PRF output is `privateKeyFromPrfOutput` from @henad/core,
 * shared with the web app and pinned by vectors, because the same passkey must produce
 * the same address on both or a person signing in here finds an empty account.
 *
 * Use mera's own client rather than writing one. It normalises two platform differences
 * that are silent rather than loud: Android rewrites binary request fields, so a salt
 * that is base64-encoded on the way through derives a *different* key, and the PRF output
 * comes back as base64 on one platform and bytes on the other.
 */

export type StoredPasskey = PasskeyCredentialMetadata

export interface MeraAccount {
  address: Address
  credentialId: string
  /** viem local account: EIP-712, EIP-191, transactions and 7702 authorizations. */
  account: LocalAccount
  /** zeroes the session key; signing afterwards throws SESSION_ENDED */
  end(): void
}

const STORAGE_KEY = 'henad.passkey'

interface StoredAccount {
  credentialId: string
  address: Address
  rpId: string
}

/**
 * What survives the app being closed: the credential id, the public address, and the
 * domain they belong to. Never the key. The key lives in the signing session for as long
 * as the session does and is re-derived from the passkey when it is needed again.
 */
export async function loadStoredAccount(): Promise<StoredAccount | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { credentialId, address, rpId: storedRp } = parsed as Partial<StoredAccount>
    if (typeof credentialId !== 'string' || !credentialId) return null
    if (typeof address !== 'string' || !isAddress(address)) return null
    // An address derived under one relying party means nothing under another.
    if (storedRp !== rpId()) return null
    return { credentialId, address, rpId: storedRp }
  } catch {
    return null
  }
}

/** Forget the account on this device. The passkey itself is untouched and still opens it. */
export async function forgetStoredAccount(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY)
  } catch {
    // Nothing stored, or storage refused; either way nothing is left to forget.
  }
}

async function store(credentialId: string, address: Address): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ credentialId, address, rpId: rpId() } satisfies StoredAccount))
  } catch {
    // Storage refused. The passkey still works; the next launch just asks for it again.
  }
}

function accountFromPrf(prfOutput: Uint8Array, credentialId: string): MeraAccount {
  // Shared with web and pinned by vectors in @henad/core. Zeroes the PRF output for us.
  const privateKey = privateKeyFromPrfOutput(prfOutput)
  const session = createSecp256k1SigningSession({ privateKey })
  privateKey.fill(0)
  return {
    address: getEvmAddress(session.publicKey),
    credentialId,
    account: toViemAccount(session),
    end: () => session.end(),
  }
}

/** First run: create the passkey and derive the account from it. */
export async function createAccount(): Promise<MeraAccount> {
  const id = rpId()
  assertRpIdForChain(appChainId(), id)
  const created = await createPasskeyWithPrfOutput({
    rp: { id, name: rpName() },
    user: { name: `henad · ${new Date().toISOString().slice(0, 10)}`, displayName: 'Henad account' },
    webAuthnClient: reactNativeWebAuthnClient,
  })
  const account = accountFromPrf(created.prfOutput, created.credentialId)
  await store(created.credentialId, account.address)
  return account
}

/**
 * Sign in with a passkey that already exists, on this device or another.
 *
 * Without `credential` the platform lists every discoverable passkey for this relying
 * party, which is how a new phone recovers the account created on the web.
 */
export async function signIn(credential?: StoredPasskey): Promise<MeraAccount> {
  const id = rpId()
  assertRpIdForChain(appChainId(), id)
  const asserted = await getPasskeyPrfOutput({
    rpId: id,
    ...(credential ? { credential } : {}),
    webAuthnClient: reactNativeWebAuthnClient,
  })
  const account = accountFromPrf(asserted.prfOutput, asserted.credentialId)
  await store(asserted.credentialId, account.address)
  return account
}

/** Continue: restore the pinned passkey if this device has one, otherwise create one. */
export async function continueWithPasskey(): Promise<MeraAccount> {
  const stored = await loadStoredAccount()
  return stored ? signIn({ credentialId: stored.credentialId }) : createAccount()
}

/**
 * Re-derive the session for the account already on this device, checking that the passkey
 * that answered belongs to the account on screen. A mismatch would sign from an account
 * the interface is not showing, so it fails loudly instead.
 */
export async function unlockStoredAccount(): Promise<MeraAccount> {
  const stored = await loadStoredAccount()
  if (!stored) throw new Error('No account on this device. Sign in with your passkey.')
  const account = await signIn({ credentialId: stored.credentialId })
  if (account.address.toLowerCase() !== stored.address.toLowerCase()) {
    account.end()
    throw new Error('That passkey belongs to a different account from the one on screen.')
  }
  return account
}

/**
 * The native reason behind a passkey failure, when there is one.
 *
 * mera wraps react-native-passkey's error as `cause`, and that error is a plain object such
 * as `{ error: 'NoCredentials', message }`. Its Android side maps Credential Manager
 * exceptions onto those codes: NoCredentialException to NoCredentials, a WebAuthn
 * SecurityError to RequestFailed, NotAllowed and Abort to UserCancelled. Codes the JS layer
 * has no case for, such as a provider configuration fault, arrive as "Native error" with
 * Android's own message.
 */
function nativeReason(e: unknown): { code: string; message: string } | null {
  let cur: unknown = e
  for (let depth = 0; depth < 4 && cur !== null && typeof cur === 'object'; depth++) {
    const o = cur as { error?: unknown; message?: unknown; cause?: unknown }
    if (typeof o.error === 'string') return { code: o.error, message: typeof o.message === 'string' ? o.message : '' }
    cur = o.cause
  }
  return null
}

/**
 * Copy for a failed passkey ceremony that names what actually happened.
 *
 * This used to blame the domain link for every failure. On 14 Sep that sent a real test the
 * wrong way: Android had found no passkey saved for the domain at all, and said so.
 */
function describePasskeyFailure(reason: { code: string; message: string } | null): string {
  const domain = rpId()
  const code = reason?.code
  const message = reason?.message ?? ''
  const detail = message ? ` Android says: ${message}` : ''
  switch (code) {
    case 'NoCredentials':
      return (
        `No passkey for ${domain} is saved on this phone. Tap Continue with passkey to create one, or use a passkey ` +
        `made on ${domain} in the same Google account. A passkey made on another domain, localhost included, can never open this account.`
      )
    case 'UserCancelled':
      return 'The passkey prompt was closed. Nothing was created or changed.'
    case 'CredentialAlreadyExists':
      return 'This phone already has a passkey for that account. Tap I already have a passkey instead.'
    case 'NoCreateOption':
      return 'No passkey provider on this phone can create one. Turn on Google Password Manager in Settings, then try again.'
    case 'NotSupported':
      return 'This phone does not support passkeys. Android 9 or later is required.'
    case 'TimedOut':
      return 'The passkey prompt timed out. Try again.'
    case 'Interrupted':
      return 'The passkey prompt was interrupted. Try again.'
    case 'RequestFailed':
      return /rp ?id|origin|domain|asset|associat/i.test(message)
        ? `This phone does not yet trust the app for ${domain} passkeys.${detail}`
        : `The passkey request failed.${detail}`
    default:
      return `The passkey prompt did not complete.${detail}`
  }
}

/** Plain-language failure copy, adapted for a phone. */
export function describeAccountError(e: unknown): string {
  if (e instanceof RpIdMismatchError) return e.message
  if (isMeraError(e)) {
    switch (e.code) {
      case 'PRF_UNAVAILABLE':
        return (
          'This passkey cannot derive an account: its provider does not support the WebAuthn PRF extension. ' +
          'On Android use Google Password Manager; on iOS you need iOS 18 or later with iCloud Keychain.'
        )
      case 'PASSKEY_OPERATION_FAILED':
        return describePasskeyFailure(nativeReason(e))
      case 'CRYPTO_UNAVAILABLE':
        return 'This device has no secure random source, so it cannot create a passkey.'
      default:
        return e.message
    }
  }
  return e instanceof Error ? e.message : 'The passkey step failed. Try again.'
}
