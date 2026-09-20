import { createWalletClient, http, type Address, type Hex, type LocalAccount } from 'viem'
import { PANCAKE_MAINNET, TOKENS, chainFor, pancakeQuoterV2Abi, pancakeSwapRouterAbi } from '@henad/core'
import { appChain, appChainId } from './config'

/**
 * Funding from the phone: MON into the stablecoin a payout spends.
 *
 * Mirrors web/src/lib/swap.ts, and the caveat is the same: this is a market swap on
 * PancakeSwap, not a Henad payout. No reference rate, no spread cap, no receipt, because a
 * pool's own price is the only price there is to check it against.
 *
 * Unlike a payout, no relayer is involved. The account signs and pays for this itself, in MON,
 * which it must therefore already hold.
 */

const DEADLINE_S = 900n

function wmon(): Address {
  const token = TOKENS[appChainId()].WMON
  if (!token) throw new Error(`No WMON address for chain ${appChainId()}`)
  return token.address
}

export function stableToken(symbol: string) {
  const token = TOKENS[appChainId()][symbol]
  if (!token) throw new Error(`No ${symbol} address for chain ${appChainId()}`)
  return token
}

export interface SwapQuote {
  amountIn: bigint
  amountOut: bigint
  /** the floor the fill may not fall below, `slippageBps` under the quote */
  minimumOut: bigint
  slippageBps: number
}

/** What this much MON buys right now. QuoterV2 is not a view function, so this simulates it. */
export async function quoteMonForStable(amountIn: bigint, symbol: string, slippageBps = 100): Promise<SwapQuote> {
  const { result } = await appChain().simulateContract({
    address: PANCAKE_MAINNET.quoterV2,
    abi: pancakeQuoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: wmon(), tokenOut: stableToken(symbol).address, amountIn, fee: PANCAKE_MAINNET.feeTier, sqrtPriceLimitX96: 0n }],
  })
  const amountOut = result[0]
  return { amountIn, amountOut, minimumOut: (amountOut * BigInt(10_000 - slippageBps)) / 10_000n, slippageBps }
}

/** Swap MON for the stablecoin. The router is payable and wraps MON, so there is no approval. */
export async function swapMonForStable(account: LocalAccount, quote: SwapQuote, symbol: string, rpcUrl?: string): Promise<Hex> {
  const wallet = createWalletClient({ account, chain: chainFor(appChainId()), transport: http(rpcUrl) })
  const now = BigInt(Math.floor(Date.now() / 1000))
  return wallet.writeContract({
    address: PANCAKE_MAINNET.swapRouter,
    abi: pancakeSwapRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: wmon(),
        tokenOut: stableToken(symbol).address,
        fee: PANCAKE_MAINNET.feeTier,
        recipient: account.address,
        deadline: now + DEADLINE_S,
        amountIn: quote.amountIn,
        amountOutMinimum: quote.minimumOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
    value: quote.amountIn,
  })
}

/** Native MON: both what a swap spends and what its gas costs. */
export async function readMonBalance(address: Address): Promise<bigint> {
  return appChain().getBalance({ address })
}
