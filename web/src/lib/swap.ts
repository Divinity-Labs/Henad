'use client'

import { createWalletClient, http, type Address, type Hex, type LocalAccount } from 'viem'
import { PANCAKE_MAINNET, TOKENS, chainFor, pancakeQuoterV2Abi, pancakeSwapRouterAbi, type SourceAssetSymbol } from '@henad/core'
import { appChain, appChainId } from './chain'

/**
 * Funding: MON into the stablecoin a payout spends.
 *
 * This is a market swap on PancakeSwap, and it is not a Henad payout. There is no reference
 * rate, no spread cap and no receipt, because there is nothing independent to check the fill
 * against: the pool's price is the only price. The interface has to say so, or it implies a
 * guarantee this cannot make.
 *
 * It exists because a new account holds MON and nothing else, and every payout needs AUSD or
 * USDC. The swap is paid for from the same account, in MON, so there is no relayer here.
 */

/** The wrapped-MON address the router pulls native value through. */
function wmon(): Address {
  const token = TOKENS[appChainId()].WMON
  if (!token) throw new Error(`No WMON address for chain ${appChainId()}`)
  return token.address
}

export function stableToken(symbol: SourceAssetSymbol) {
  const token = TOKENS[appChainId()][symbol]
  if (!token) throw new Error(`No ${symbol} address for chain ${appChainId()}`)
  return token
}

export interface SwapQuote {
  /** MON in, wei */
  amountIn: bigint
  /** stablecoin out, base units */
  amountOut: bigint
  /** what the fill may not fall below, `slippageBps` under the quote */
  minimumOut: bigint
  slippageBps: number
}

/**
 * What this much MON buys right now, read from the pool.
 *
 * QuoterV2 is not a view function — it swaps and reverts to report the number — so this
 * simulates the call rather than sending it.
 */
export async function quoteMonForStable(amountIn: bigint, symbol: SourceAssetSymbol, slippageBps = 100): Promise<SwapQuote> {
  const { result } = await appChain().simulateContract({
    address: PANCAKE_MAINNET.quoterV2,
    abi: pancakeQuoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: wmon(), tokenOut: stableToken(symbol).address, amountIn, fee: PANCAKE_MAINNET.feeTier, sqrtPriceLimitX96: 0n }],
  })
  const amountOut = result[0]
  return { amountIn, amountOut, minimumOut: (amountOut * BigInt(10_000 - slippageBps)) / 10_000n, slippageBps }
}

/** How long a signed swap stays valid. Long enough for a slow phone, short enough to expire. */
const DEADLINE_S = 900n

/**
 * Swap MON for the stablecoin, from the payer's own account.
 *
 * The router is payable and wraps MON itself, so there is no approval and no wrapping step.
 * `minimumOut` is the floor the payer approved: a worse fill reverts and the MON stays put.
 */
export async function swapMonForStable(
  account: LocalAccount,
  quote: SwapQuote,
  symbol: SourceAssetSymbol,
  opts?: { recipient?: Address },
): Promise<Hex> {
  const chainId = appChainId()
  const wallet = createWalletClient({ account, chain: chainFor(chainId), transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL) })
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
        recipient: opts?.recipient ?? account.address,
        deadline: now + DEADLINE_S,
        amountIn: quote.amountIn,
        amountOutMinimum: quote.minimumOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
    value: quote.amountIn,
  })
}

/** Native MON balance, which is both what a swap spends and what its gas costs. */
export async function readMonBalance(address: Address): Promise<bigint> {
  return appChain().getBalance({ address })
}
