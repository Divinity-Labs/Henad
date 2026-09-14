import Constants from 'expo-constants'
import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { MAINNET_RPCS, MONAD_MAINNET_ID, MONAD_TESTNET_ID, TESTNET_RPCS, chainFor, isMonadChainId, type MonadChainId } from '@henad/core'

/**
 * Runtime configuration, read from `app.config.ts` `extra` rather than inlined.
 *
 * The web client can fall back to `window.location.hostname` for its relying-party id.
 * There is no hostname here, so these values have to be declared, and they have to match
 * the web app exactly: the rpId is half of what determines the account's address.
 */
function extra<T>(key: string): T | undefined {
  return (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[key] as T | undefined
}

export function rpId(): string {
  const value = extra<string>('rpId')
  if (!value) throw new Error('app.config.ts is missing extra.rpId — a passkey cannot be created without one')
  return value
}

export function rpName(): string {
  return extra<string>('rpName') ?? 'Henad'
}

export function appChainId(): MonadChainId {
  const raw = Number(extra<number>('chainId') ?? MONAD_TESTNET_ID)
  if (!isMonadChainId(raw)) throw new Error(`extra.chainId must be ${MONAD_MAINNET_ID} or ${MONAD_TESTNET_ID}`)
  return raw
}

let client: PublicClient | undefined

/** Read-only client for the chain this build settles on. */
export function appChain(): PublicClient {
  if (!client) {
    const id = appChainId()
    const urls = id === MONAD_MAINNET_ID ? MAINNET_RPCS : TESTNET_RPCS
    client = createPublicClient({
      chain: chainFor(id),
      transport: fallback(urls.map((u) => http(u, { batch: true }))),
    })
  }
  return client
}
