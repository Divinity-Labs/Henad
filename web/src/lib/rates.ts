import type { Address, Hex } from 'viem'
import { aggregatorV3Abi, mentoRouterAbi, oracleAdapterAbi, fpmmAbi, MENTO_MAINNET, MONAD_MAINNET_ID, TOKENS } from '@henad/core'
import { mainnet } from './chain'
import { CORRIDORS, type Corridor, type FeedRef } from './corridors'
import { isFxMarketOpen } from './market-hours'

const ONE = 10n ** 18n

export interface LiveRate {
  corridor: Corridor
  /** target units per 1 USD, 1e18 fixed point; null when the corridor is unpriced or the read failed */
  rate: bigint | null
  updatedAt: number | null
  /** true when older than 1.5× the feed heartbeat (Chainlink) or the Pyth publish is older than 5 min */
  stale: boolean
  /** true when Mento's market-hours breaker closes the venue right now */
  marketClosed: boolean
  source: string
  error?: string
}

/** Chainlink answer (USD per target, `decimals`) -> target per USD at 1e18. */
function invertToPerUsd(answer: bigint, decimals: number): bigint {
  const scaled = answer * 10n ** BigInt(18 - decimals) // USD per target, 1e18
  return (ONE * ONE) / scaled
}

async function readChainlink(feed: FeedRef) {
  const client = mainnet()
  const [roundId, answer, , updatedAt] = await client.readContract({
    address: feed.ref as Address,
    abi: aggregatorV3Abi,
    functionName: 'latestRoundData',
  })
  return { roundId, answer, updatedAt: Number(updatedAt) }
}

/**
 * Pyth prices are deliberately not read here.
 *
 * Pyth is a pull oracle: a price only exists on Monad once somebody pays to post it,
 * and nobody posts FX there — in a 100-block sample, 53 Pyth feeds were updated on
 * Monad and not one was a currency. The rand value sitting in Monad's Pyth contract
 * was published 2 Sep 2025 and every staleness-checked read reverts StalePrice.
 * Hermes, the off-chain price service, now returns 401 without an API key
 * (PYTH_HERMES_API_KEY), so quoting it would also mean showing a number that is not
 * on the chain we settle on. If a Pyth-priced corridor is ever added, read it
 * on-chain through the Pyth contract with getPriceNoOlderThan and let it revert.
 */

/**
 * Coalesce the per-request rate reads.
 *
 * Every page that shows a rate is dynamic, so each view would otherwise issue one
 * `latestRoundData` per corridor against a public RPC capped at 25 requests a second.
 * This is a deliberately small, deliberately in-process cache: it lives in module
 * scope, dies with the server, and cannot outlive its TTL. That is the whole point —
 * the framework cache it replaces persisted to disk, survived restarts, and served a
 * 15-hour-old rate under a badge that said "stale" (see chain.ts).
 *
 * 12 seconds sits under the 240 s feed heartbeat by a wide margin, so the age and the
 * staleness badge stay honest to within a rounding error.
 */
const RATES_TTL_MS = 12_000
let ratesCache: { at: number; value: Promise<LiveRate[]> } | null = null

/** Live reference rates for every corridor in the registry. Unpriced rows return rate null. */
export async function liveRates(): Promise<LiveRate[]> {
  const now = Date.now()
  if (ratesCache && now - ratesCache.at < RATES_TTL_MS) return ratesCache.value
  const value = readAllRates()
  ratesCache = { at: now, value }
  // A failed read must not be cached, or one RPC hiccup freezes the site for 12 s.
  value.catch(() => {
    if (ratesCache?.value === value) ratesCache = null
  })
  return value
}

async function readAllRates(): Promise<LiveRate[]> {
  const now = Math.floor(Date.now() / 1000)
  const closed = !isFxMarketOpen(now)
  return Promise.all(
    CORRIDORS.map(async (corridor): Promise<LiveRate> => {
      const base = { corridor, source: corridor.feed?.label ?? 'none', marketClosed: closed && corridor.tier === 'live' }
      if (!corridor.feed) return { ...base, rate: null, updatedAt: null, stale: false }
      try {
        if (corridor.feed.kind === 'chainlink') {
          const { answer, updatedAt } = await readChainlink(corridor.feed)
          const rate = corridor.feed.usdPerTarget ? invertToPerUsd(answer, corridor.feed.decimals ?? 18) : answer * 10n ** BigInt(18 - (corridor.feed.decimals ?? 18))
          const stale = now - updatedAt > (corridor.feed.heartbeatSec ?? 3600) * 1.5
          return { ...base, rate, updatedAt, stale }
        }
        // No non-Chainlink feed is wired; see the note above readPyth's removal.
        return { ...base, rate: null, updatedAt: null, stale: true, error: 'unsupported feed kind' }
      } catch (e) {
        return { ...base, rate: null, updatedAt: null, stale: true, error: (e as Error).message }
      }
    }),
  )
}

/**
 * The reference rate exactly as ChainlinkRateSource computes it on-chain:
 * floor(sourceUsd(1e18) * 1e18 / targetUsd(1e18)), target per source asset.
 * Source asset feed is AUSD/USD or USDC/USD (8 dec); target feed is e.g. GBP/USD (18 dec).
 */
export async function referenceRate(sourceFeed: Address, sourceDecimals: number, targetFeed: Address, targetDecimals: number) {
  const client = mainnet()
  const [s, t] = await Promise.all([
    client.readContract({ address: sourceFeed, abi: aggregatorV3Abi, functionName: 'latestRoundData' }),
    client.readContract({ address: targetFeed, abi: aggregatorV3Abi, functionName: 'latestRoundData' }),
  ])
  const srcUsd = s[1] * 10n ** BigInt(18 - sourceDecimals)
  const dstUsd = t[1] * 10n ** BigInt(18 - targetDecimals)
  const rate = (srcUsd * ONE) / dstUsd
  const observation = ((BigInt(s[0]) << 80n) | BigInt(t[0])) as unknown as bigint
  return {
    rate,
    updatedAt: Number(s[3] < t[3] ? s[3] : t[3]),
    sourceRound: s[0],
    targetRound: t[0],
    observation: `0x${observation.toString(16).padStart(64, '0')}` as Hex,
  }
}

/** Venue quote through Mento: sourceAsset -> USDm -> targetAsset, exactly what the swap would deliver this block. */
export async function mentoQuote(sourceAsset: Address, targetAsset: Address, amountIn: bigint): Promise<bigint> {
  const usdm = TOKENS[MONAD_MAINNET_ID].USDm!.address
  const routes =
    targetAsset.toLowerCase() === usdm.toLowerCase()
      ? [{ from: sourceAsset, to: usdm, factory: '0x0000000000000000000000000000000000000000' as Address }]
      : [
          { from: sourceAsset, to: usdm, factory: '0x0000000000000000000000000000000000000000' as Address },
          { from: usdm, to: targetAsset, factory: '0x0000000000000000000000000000000000000000' as Address },
        ]
  const amounts = await mainnet().readContract({
    address: MENTO_MAINNET.router,
    abi: mentoRouterAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, routes],
  })
  return amounts[amounts.length - 1]!
}

/** Tradability of the target pool right now, read from the pool's own oracle adapter. */
export async function poolStatus(pool: Address): Promise<{ open: boolean; recent: boolean; suspended: boolean }> {
  const client = mainnet()
  const [adapter, feedId] = await Promise.all([
    client.readContract({ address: pool, abi: fpmmAbi, functionName: 'oracleAdapter' }),
    client.readContract({ address: pool, abi: fpmmAbi, functionName: 'referenceRateFeedID' }),
  ])
  const info = await client.readContract({ address: adapter, abi: oracleAdapterAbi, functionName: 'getRate', args: [feedId] })
  return { open: info.isFXMarketOpen, recent: info.isRecent, suspended: info.tradingMode !== 0 }
}
