'use client'

import { erc20Abi, parseAbi, type Address, type Hex, type LocalAccount } from 'viem'
import type { SourceAssetSymbol } from '@henad/core'
import { appChain } from './chain'
import { stableToken, quoteRelay, executeRelay } from './swap'

/**
 * Buying and selling US stocks as xStocks on Monad (docs/STOCKS.md, 18 Nov 2026).
 *
 * The liquid markets are Uniswap v4 pools of USDC against *wrapped* xStocks: ERC-4626 vaults
 * over the xStock, 18 decimals, freely transferable, no hook on the pool. One wrapped token
 * is worth `convertToAssets(1e18)` xStocks, and one xStock tracks one share (its multiplier
 * absorbs splits and dividends). Orders are filled through Relay, the same checked path as
 * Top up, and priced against Monday Trade's oracle so every order shows its spread.
 *
 * Only tickers that have both a pool and an oracle price are tradable. Match by address,
 * never by symbol: the chain holds about 1,400 look-alike "…x" pools with ~99% fees.
 */
export const XSTOCKS: Record<string, { wrapped: Address; label: string }> = {
  ANT: { wrapped: '0xabec6aeab037b77c09a2a99264f9c81a35b02649', label: 'wANTx' },
  NVDA: { wrapped: '0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5', label: 'wNVDAx' },
  TSLA: { wrapped: '0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171', label: 'wTSLAx' },
  SPY: { wrapped: '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540', label: 'wSPYx' },
  QQQ: { wrapped: '0x4C1AE29c159838fC1b224636E28E086EB69101f7', label: 'wQQQx' },
}

export const XSTOCK_DECIMALS = 18
const ONE = 10n ** 18n
const vaultAbi = parseAbi(['function convertToAssets(uint256 shares) view returns (uint256)'])

export const tradable = (symbol: string) => symbol in XSTOCKS

/** Shares of the stock one wrapped token stands for, e.g. 1.0075 for wSPYx after dividends. */
export async function sharesPerToken(symbol: string): Promise<number> {
  const assets = await appChain().readContract({ address: XSTOCKS[symbol]!.wrapped, abi: vaultAbi, functionName: 'convertToAssets', args: [ONE] })
  return Number(assets) / 1e18
}

export async function readXStockBalance(symbol: string, owner: Address): Promise<bigint> {
  return appChain().readContract({ address: XSTOCKS[symbol]!.wrapped, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
}

export interface StockOrderQuote {
  side: 'buy' | 'sell'
  symbol: string
  /** the dollar the order is paid in, or paid out in: USDC or AUSD, both 6 decimals */
  cash: SourceAssetSymbol
  amountIn: bigint
  amountOut: bigint
  minimumOut: bigint
  slippageBps: number
  /** USD per share actually paid or received, after the vault ratio */
  executedPrice: number
  /** USD per share from the oracle, the reference */
  referencePrice: number
  /** How much worse than the reference, in basis points; negative means better */
  spreadBps: number
}

/**
 * What an order fills at right now, against the oracle's price per share. `amountIn` is the
 * dollar (USDC or AUSD, 6 decimals) for a buy, wrapped tokens (18) for a sell.
 */
export async function quoteStockOrder(
  side: 'buy' | 'sell',
  symbol: string,
  cash: SourceAssetSymbol,
  amountIn: bigint,
  user: Address,
  referencePrice: number,
  slippageBps = 100,
): Promise<StockOrderQuote> {
  const usdc = stableToken(cash).address
  const wrapped = XSTOCKS[symbol]!.wrapped
  const [q, ratio] = await Promise.all([
    side === 'buy' ? quoteRelay(amountIn, usdc, wrapped, user, slippageBps) : quoteRelay(amountIn, wrapped, usdc, user, slippageBps),
    sharesPerToken(symbol),
  ])
  const usdcAmount = Number(side === 'buy' ? amountIn : q.amountOut) / 1e6
  const shares = (Number(side === 'buy' ? q.amountOut : amountIn) / 1e18) * ratio
  const executedPrice = usdcAmount / shares
  const worse = side === 'buy' ? executedPrice - referencePrice : referencePrice - executedPrice
  return {
    side,
    symbol,
    cash,
    amountIn,
    amountOut: q.amountOut,
    minimumOut: q.minimumOut,
    slippageBps,
    executedPrice,
    referencePrice,
    spreadBps: (worse / referencePrice) * 10_000,
  }
}

export async function executeStockOrder(account: LocalAccount, quote: StockOrderQuote, opts?: { onApproved?: () => void }): Promise<Hex> {
  const usdc = stableToken(quote.cash).address
  const wrapped = XSTOCKS[quote.symbol]!.wrapped
  return quote.side === 'buy' ? executeRelay(account, usdc, wrapped, quote, opts) : executeRelay(account, wrapped, usdc, quote, opts)
}
