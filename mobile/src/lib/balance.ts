import { erc20Abi, TOKENS, type SourceAssetSymbol } from '@henad/core'
import type { Address } from 'viem'
import { appChain, appChainId } from './config'

/** The stablecoin a payout is funded from on this chain. AUSD unless the payer picks otherwise. */
export function sourceToken(symbol: SourceAssetSymbol = 'AUSD'): { address: Address; symbol: SourceAssetSymbol; decimals: number } {
  const token = TOKENS[appChainId()][symbol]
  if (!token) throw new Error(`No ${symbol} address for chain ${appChainId()}`)
  // Narrowed: the registry types every symbol as a plain string, and the screens need to
  // know which of the two source assets this is.
  return { address: token.address, symbol, decimals: token.decimals }
}

/** Balance in the chosen source stablecoin, or null when the read fails. */
export async function readBalance(address: Address, symbol: SourceAssetSymbol = 'AUSD'): Promise<bigint | null> {
  try {
    return await appChain().readContract({
      address: sourceToken(symbol).address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    })
  } catch {
    return null
  }
}

export interface Holding {
  symbol: string
  decimals: number
  value: bigint
}

/**
 * Every registry stablecoin this account holds on the configured chain: the source coins a
 * payout is funded from and the pound, euro, franc and yen tokens a payout delivers.
 * Null when the chain cannot be read, so the screen can say so instead of showing zeros.
 */
export async function readHoldings(address: Address): Promise<Holding[] | null> {
  const tokens = Object.values(TOKENS[appChainId()] ?? {}).filter((t) => t.symbol !== 'WMON')
  try {
    const values = await Promise.all(
      tokens.map((t) => appChain().readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })),
    )
    return tokens.map((t, i) => ({ symbol: t.symbol, decimals: t.decimals, value: values[i] ?? 0n }))
  } catch {
    return null
  }
}

/** Fixed-point amount to a plain string, truncated rather than rounded. */
export function formatUnits(value: bigint, decimals: number, dp = 2): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = ((value % base) * 10n ** BigInt(dp)) / base
  return `${whole.toLocaleString('en-US')}.${frac.toString().padStart(dp, '0')}`
}

/** "0x7a3f…9c2e", the same shortening the web app uses. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
