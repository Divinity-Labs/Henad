import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import {
  MAINNET_RPCS,
  MONAD_MAINNET_ID,
  MONAD_TESTNET_ID,
  TESTNET_RPCS,
  chainFor,
  isMonadChainId,
  type MonadChainId,
} from '@henad/core'

/** Chain the app is configured for. Mainnet only when explicitly set. */
export function appChainId(): MonadChainId {
  const raw = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? MONAD_TESTNET_ID)
  if (!isMonadChainId(raw)) throw new Error(`NEXT_PUBLIC_MONAD_CHAIN_ID must be ${MONAD_MAINNET_ID} or ${MONAD_TESTNET_ID}`)
  return raw
}

/** Mainnet client for live rate reads. Reads are cached 30 s by Next's fetch. */
let mainnetClient: PublicClient | undefined
export function mainnet(): PublicClient {
  if (!mainnetClient) {
    const custom = process.env.NEXT_PUBLIC_MONAD_RPC_URL
    const urls = custom && appChainId() === MONAD_MAINNET_ID ? [custom, ...MAINNET_RPCS] : [...MAINNET_RPCS]
    mainnetClient = createPublicClient({
      chain: chainFor(MONAD_MAINNET_ID),
      transport: fallback(urls.map((u) => http(u, { fetchOptions: { next: { revalidate: 30 } } as RequestInit, batch: true }))),
    })
  }
  return mainnetClient
}

/** Client for the chain the app settles on (testnet during development). */
let appClient: PublicClient | undefined
export function appChain(): PublicClient {
  if (!appClient) {
    const id = appChainId()
    const custom = process.env.NEXT_PUBLIC_MONAD_RPC_URL
    const defaults = id === MONAD_MAINNET_ID ? MAINNET_RPCS : TESTNET_RPCS
    const urls = custom ? [custom, ...defaults] : [...defaults]
    appClient = createPublicClient({
      chain: chainFor(id),
      transport: fallback(urls.map((u) => http(u, { batch: true }))),
    })
  }
  return appClient
}
