import { erc20Abi, TOKENS } from '@henad/core'
import type { Address } from 'viem'
import { appChain, appChainId } from './config'

/** The stablecoin a payout is funded from on this chain. */
export function sourceToken() {
  const token = TOKENS[appChainId()].AUSD
  if (!token) throw new Error(`No AUSD address for chain ${appChainId()}`)
  return token
}

/** Balance in the source stablecoin, or null when the read fails. */
export async function readBalance(address: Address): Promise<bigint | null> {
  try {
    return await appChain().readContract({
      address: sourceToken().address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    })
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
