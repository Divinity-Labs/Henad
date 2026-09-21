import type { Address, Hex } from 'viem'
import { CHAINLINK_MAINNET, MENTO_MAINNET, TOKENS } from './addresses'
import { MONAD_MAINNET_ID } from './chains'
import { corridorId } from './corridor'

/**
 * The corridor registry as the product shows it. Three tiers, from
 * docs/INTEGRATION-FACTS.md §14:
 *   live      a reference feed AND a venue (Mento pool) on Monad
 *   quote     a reference feed on Monad but no asset to deliver into
 *   unpriced  no feed on Monad at all
 * A corridor is only settleable when the deployed CorridorRouter has it
 * registered; `live` here says the rails exist, not that the button is enabled.
 */
export type Tier = 'live' | 'quote' | 'unpriced'

export interface FeedRef {
  kind: 'chainlink' | 'pyth'
  label: string
  /** Chainlink proxy address on Monad, or a Pyth price id. */
  ref: string
  decimals?: number
  heartbeatSec?: number
  /** true when the feed answer is USD per unit of target (invert to get target per USD). */
  usdPerTarget: boolean
}

export interface Corridor {
  id: Hex
  key: string // "USD/GBP"
  source: string
  target: string
  targetSymbol: string
  /** Currency name for copy, e.g. "pounds" */
  targetName: string
  tier: Tier
  feed: FeedRef | null
  venue: { label: string; pool: Address } | null
  targetAsset: { symbol: string; address: Address; decimals: number } | null
  /**
   * Source assets the deployed CorridorRouter will actually settle this pair from.
   *
   * Registration is an owner-key transaction, so this list only changes when we change it,
   * and it is what the clients gate the picker on. Read back from mainnet on 18 Sep 2026:
   * AUSD into GBP, EUR, CHF and JPY, USDC into GBP. A pair not listed here reverts with
   * `ZeroCorridor` rather than failing politely, which is no way to learn it.
   */
  sources: readonly SourceAssetSymbol[]
  note: string
  /** Six-word version of `note` for the hero cards, where there is no room for the full reason. */
  shortNote: string
  /** Decimal places when formatting a rate in this corridor. */
  rateDp: number
  currencyDp: number
}

const CL = CHAINLINK_MAINNET
const T = TOKENS[MONAD_MAINNET_ID]
const P = MENTO_MAINNET.pools

export const CORRIDORS: Corridor[] = [
  {
    id: corridorId('USD', 'GBP'),
    key: 'USD/GBP',
    source: 'USD',
    target: 'GBP',
    targetSymbol: '£',
    targetName: 'pounds',
    tier: 'live',
    feed: { kind: 'chainlink', label: 'Chainlink GBP/USD', ref: CL['GBP/USD'].address, decimals: 18, heartbeatSec: 240, usdPerTarget: true },
    venue: { label: 'Mento GBPm/USDm', pool: P['GBPm/USDm'] },
    targetAsset: { symbol: 'GBPm', address: T.GBPm!.address, decimals: 18 },
    sources: ['AUSD', 'USDC'],
    note: 'Mento GBPm/USDm · Chainlink GBP/USD',
    shortNote: 'Mento · Chainlink',
    rateDp: 5,
    currencyDp: 2,
  },
  {
    id: corridorId('USD', 'EUR'),
    key: 'USD/EUR',
    source: 'USD',
    target: 'EUR',
    targetSymbol: '€',
    targetName: 'euros',
    tier: 'live',
    feed: { kind: 'chainlink', label: 'Chainlink EUR/USD', ref: CL['EUR/USD'].address, decimals: 18, heartbeatSec: 240, usdPerTarget: true },
    venue: { label: 'Mento EURm/USDm', pool: P['EURm/USDm'] },
    targetAsset: { symbol: 'EURm', address: T.EURm!.address, decimals: 18 },
    sources: ['AUSD'],
    note: 'Mento EURm/USDm · Chainlink EUR/USD',
    shortNote: 'Mento · Chainlink',
    rateDp: 5,
    currencyDp: 2,
  },
  {
    id: corridorId('USD', 'CHF'),
    key: 'USD/CHF',
    source: 'USD',
    target: 'CHF',
    targetSymbol: 'CHF ',
    targetName: 'francs',
    tier: 'live',
    feed: { kind: 'chainlink', label: 'Chainlink CHF/USD', ref: CL['CHF/USD'].address, decimals: 18, heartbeatSec: 240, usdPerTarget: true },
    venue: { label: 'Mento CHFm/USDm', pool: P['CHFm/USDm'] },
    targetAsset: { symbol: 'CHFm', address: T.CHFm!.address, decimals: 18 },
    sources: ['AUSD'],
    note: 'Mento CHFm/USDm · Chainlink CHF/USD',
    shortNote: 'Mento · Chainlink',
    rateDp: 5,
    currencyDp: 2,
  },
  {
    id: corridorId('USD', 'JPY'),
    key: 'USD/JPY',
    source: 'USD',
    target: 'JPY',
    targetSymbol: '¥',
    targetName: 'yen',
    tier: 'live',
    feed: { kind: 'chainlink', label: 'Chainlink JPY/USD', ref: CL['JPY/USD'].address, decimals: 18, heartbeatSec: 240, usdPerTarget: true },
    venue: { label: 'Mento JPYm/USDm', pool: P['JPYm/USDm'] },
    targetAsset: { symbol: 'JPYm', address: T.JPYm!.address, decimals: 18 },
    sources: ['AUSD'],
    note: 'Mento JPYm/USDm · Chainlink JPY/USD',
    shortNote: 'Mento · Chainlink',
    rateDp: 2,
    currencyDp: 0,
  },
  {
    id: corridorId('USD', 'CAD'),
    key: 'USD/CAD',
    source: 'USD',
    target: 'CAD',
    targetSymbol: 'C$',
    targetName: 'Canadian dollars',
    tier: 'quote',
    // §4: CAD/USD proxy on Monad
    feed: { kind: 'chainlink', label: 'Chainlink CAD/USD', ref: '0x3293eA5650E9f8c4091642b7EB1C46CFEe5197cA', decimals: 18, heartbeatSec: 240, usdPerTarget: true },
    venue: null,
    targetAsset: null,
    sources: [],
    note: 'Priced · no asset on Monad',
    shortNote: 'Priced · no asset',
    rateDp: 4,
    currencyDp: 2,
  },
  {
    id: corridorId('USD', 'ZAR'),
    key: 'USD/ZAR',
    source: 'USD',
    target: 'ZAR',
    targetSymbol: 'R',
    targetName: 'rand',
    // Not 'quote'. Quote means a live reference rate with no asset to deliver into.
    // Pyth is a pull oracle: it publishes USD/ZAR (price id
    // 0x389d889017db82bf42141f23b61b8de938a4e2d156e36312175bebf797f493f1, the only
    // African currency in its ~1,893 feeds) but nobody posts FX to Monad. The value
    // stored in Monad's Pyth contract was published 2 Sep 2025 and every
    // staleness-checked read reverts StalePrice, so there is no usable rand price
    // here. Read on-chain 10 Sep 2026.
    tier: 'unpriced',
    feed: null,
    venue: null,
    targetAsset: null,
    sources: [],
    note: 'Pyth publishes USD/ZAR but nobody posts it to Monad · last on-chain price 2 Sep 2025',
    shortNote: 'Pyth feed · not posted here',
    rateDp: 3,
    currencyDp: 2,
  },
  {
    id: corridorId('USD', 'NGN'),
    key: 'USD/NGN',
    source: 'USD',
    target: 'NGN',
    targetSymbol: '₦',
    targetName: 'naira',
    tier: 'unpriced',
    feed: null,
    venue: null,
    targetAsset: null,
    sources: [],
    note: 'No NGN feed on Monad · Chainlink NGN/USD exists on Celo',
    shortNote: 'No feed on Monad',
    rateDp: 2,
    currencyDp: 2,
  },
]

export const LIVE_CORRIDOR = CORRIDORS[0]!

export function corridorByKey(key: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.key === key)
}

export function corridorById(id: Hex): Corridor | undefined {
  return CORRIDORS.find((c) => c.id.toLowerCase() === id.toLowerCase())
}

export function corridorsFor(symbol: SourceAssetSymbol): Corridor[] {
  return CORRIDORS.filter((c) => c.sources.includes(symbol))
}

/** Whether a payout in this pair can be funded from this asset today. */
export function settleableFrom(corridor: Corridor, symbol: SourceAssetSymbol): boolean {
  return corridor.sources.includes(symbol)
}

/** Source assets a payer may send. AUSD is the primary (Agora bounty); USDC secondary. */
export const SOURCE_ASSETS = [
  { symbol: 'AUSD', address: T.AUSD!.address, decimals: 6, label: 'AUSD' },
  { symbol: 'USDC', address: T.USDC!.address, decimals: 6, label: 'USDC' },
] as const
export type SourceAssetSymbol = (typeof SOURCE_ASSETS)[number]['symbol']
