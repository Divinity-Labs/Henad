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

/**
 * True when the configured chain is served by a local fork rather than the real
 * network (`anvil -n monad --fork-url … --chain-id 143`, docs/INTEGRATION-FACTS.md
 * §14.7). A fork reports mainnet's chain id because it is a copy of mainnet, so
 * nothing derived from the chain id can tell them apart and the operator has to say.
 *
 * It has one job beyond relaxing the passkey domain guard, and it matters more: the
 * public Monad endpoints are dropped from the transport entirely. Without that, a
 * `fallback()` whose first entry is a dead local node quietly promotes real mainnet
 * to primary, and the relayer broadcasts a real transaction while the screen still
 * says local. Failing is the only acceptable behaviour there.
 */
export function isLocalFork(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_FORK?.trim() === '1'
}

/** On a local fork the custom RPC is the only endpoint; there is no falling back to the real chain. */
function localOnly(custom: string | undefined): string[] | null {
  if (!isLocalFork()) return null
  if (!custom) throw new Error('NEXT_PUBLIC_LOCAL_FORK=1 needs NEXT_PUBLIC_MONAD_RPC_URL pointing at the local node')
  return [custom]
}

/**
 * Chain the app is configured for.
 *
 * Mainnet by default since 18 Sep 2026, when the contracts were deployed there: that is where
 * a payout actually settles, and testnet has no Mento pool or Chainlink feed to settle against.
 * `web/.env.development` still pins 10143 for local work with fixtures.
 */
export function appChainId(): MonadChainId {
  const raw = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? MONAD_MAINNET_ID)
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
    const urls = localOnly(custom) ?? (custom && appChainId() === MONAD_MAINNET_ID ? [custom, ...MAINNET_RPCS] : [...MAINNET_RPCS])
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
    const urls = localOnly(custom) ?? (custom ? [custom, ...defaults] : [...defaults])
    appClient = createPublicClient({
      chain: chainFor(id),
      transport: fallback(urls.map((u) => http(u, { fetchOptions: { cache: 'no-store' }, batch: true }))),
    })
  }
  return appClient
}
