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

/**
 * Mainnet client for live rate reads.
 *
 * These reads are deliberately NOT cached at the fetch layer. They used to carry
 * `next: { revalidate: 30 }`, which put every JSON-RPC batch in Next's persistent
 * Data Cache; entries survived dev-server restarts and rebuilds and went on being
 * served long past their window. Measured on /send: a reference rate and its
 * `updatedAt` frozen 15.5 hours in the past, unchanged across requests, with the
 * page's own staleness badge faithfully reporting the age of the cache rather than
 * the age of the feed.
 *
 * That is worse than slow. Henad's whole claim is that the number on the receipt is
 * the number the chain had, so a cached rate makes the product lie in the one place
 * it must not. Throttling belongs at the route, where it is visible: `/`, `/rates`
 * and `/receipts` each declare `revalidate = 30`, and `/send` is dynamic on purpose.
 */
let mainnetClient: PublicClient | undefined
export function mainnet(): PublicClient {
  if (!mainnetClient) {
    const custom = process.env.NEXT_PUBLIC_MONAD_RPC_URL
    const urls = custom && appChainId() === MONAD_MAINNET_ID ? [custom, ...MAINNET_RPCS] : [...MAINNET_RPCS]
    mainnetClient = createPublicClient({
      chain: chainFor(MONAD_MAINNET_ID),
      transport: fallback(urls.map((u) => http(u, { fetchOptions: { cache: 'no-store' }, batch: true }))),
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
      transport: fallback(urls.map((u) => http(u, { fetchOptions: { cache: 'no-store' }, batch: true }))),
    })
  }
  return appClient
}
