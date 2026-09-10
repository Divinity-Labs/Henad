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

async function readPyth(priceId: string): Promise<{ price: number; publishTime: number }> {
  const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${priceId}&parsed=true`
  const res = await fetch(url, { next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}`)
  const json = (await res.json()) as { parsed: { price: { price: string; expo: number; publish_time: number } }[] }
  const p = json.parsed[0]!.price
  return { price: Number(p.price) * 10 ** p.expo, publishTime: p.publish_time }
}

/** Live reference rates for every corridor in the registry. Unpriced rows return rate null. */
export async function liveRates(): Promise<LiveRate[]> {
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
        const { price, publishTime } = await readPyth(corridor.feed.ref)
        const rate = BigInt(Math.round(price * 1e6)) * 10n ** 12n
        return { ...base, rate, updatedAt: publishTime, stale: now - publishTime > 300 }
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
