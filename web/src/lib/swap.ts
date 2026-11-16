'use client'

import { createWalletClient, erc20Abi, http, zeroAddress, type Address, type Hex, type LocalAccount } from 'viem'
import {
  MENTO_MAINNET,
  PANCAKE_MAINNET,
  TOKENS,
  chainFor,
  mentoRouterAbi,
  pancakeQuoterV2Abi,
  pancakeSwapRouterAbi,
  type SourceAssetSymbol,
} from '@henad/core'
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

// ── Stable to stable: USDC ⇄ AUSD ───────────────────────────────────────────────────────────
//
// Two venues, read at the moment of quoting, and the one that pays more wins. Measured on
// 11 Nov 2026: PancakeSwap's direct USDC/AUSD 0.01% pool returned 4.99994 AUSD for 5 USDC but
// holds only about $150, so it is best for small swaps and useless above that; Mento's
// oracle-priced route through USDm returned 4.99560 for 5 and 999.12 for 1,000. Routing through
// MON was never better (983.88 for 1,000), so it is not a candidate.

/** PancakeSwap's direct stable pool sits in the 0.01% tier. */
const STABLE_FEE_TIER = 100

/** Only what the swap needs; the read side lives in @henad/core. */
const mentoSwapAbi = [
  ...mentoRouterAbi,
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'factory', type: 'address' },
        ],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

export type StableVenue = 'pancake' | 'mento'

export interface StableSwapQuote {
  from: SourceAssetSymbol
  to: SourceAssetSymbol
  amountIn: bigint
  amountOut: bigint
  minimumOut: bigint
  slippageBps: number
  venue: StableVenue
  /** Names the venue for the screen, e.g. "Mento, via USDm". */
  venueLabel: string
}

function mentoRoutes(from: SourceAssetSymbol, to: SourceAssetSymbol) {
  const usdm = TOKENS[appChainId()].USDm
  if (!usdm) throw new Error(`No USDm address for chain ${appChainId()}`)
  // factory = address(0) resolves to Mento's FPMMFactory.
  return [
    { from: stableToken(from).address, to: usdm.address, factory: zeroAddress },
    { from: usdm.address, to: stableToken(to).address, factory: zeroAddress },
  ]
}

async function quotePancakeStable(amountIn: bigint, from: SourceAssetSymbol, to: SourceAssetSymbol): Promise<bigint> {
  const { result } = await appChain().simulateContract({
    address: PANCAKE_MAINNET.quoterV2,
    abi: pancakeQuoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: stableToken(from).address, tokenOut: stableToken(to).address, amountIn, fee: STABLE_FEE_TIER, sqrtPriceLimitX96: 0n }],
  })
  return result[0]
}

async function quoteMentoStable(amountIn: bigint, from: SourceAssetSymbol, to: SourceAssetSymbol): Promise<bigint> {
  const amounts = await appChain().readContract({
    address: MENTO_MAINNET.router,
    abi: mentoRouterAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, mentoRoutes(from, to)],
  })
  return amounts[amounts.length - 1]!
}

/** Both venues at once; the better fill wins. Rejects only when neither can quote. */
export async function quoteStableSwap(amountIn: bigint, from: SourceAssetSymbol, to: SourceAssetSymbol, slippageBps = 50): Promise<StableSwapQuote> {
  const [pancake, mento] = await Promise.allSettled([quotePancakeStable(amountIn, from, to), quoteMentoStable(amountIn, from, to)])
  const p = pancake.status === 'fulfilled' ? pancake.value : -1n
  const m = mento.status === 'fulfilled' ? mento.value : -1n
  if (p <= 0n && m <= 0n) throw new Error('No venue can quote this swap right now.')
  const venue: StableVenue = p >= m ? 'pancake' : 'mento'
  const amountOut = venue === 'pancake' ? p : m
  return {
    from,
    to,
    amountIn,
    amountOut,
    minimumOut: (amountOut * BigInt(10_000 - slippageBps)) / 10_000n,
    slippageBps,
    venue,
    venueLabel: venue === 'pancake' ? 'PancakeSwap 0.01% pool' : 'Mento, via USDm',
  }
}

/**
 * Swap one stablecoin for the other, from the payer's own account: an exact approval for the
 * chosen venue when the current one is short, then the swap. Two transactions at most, both
 * paid in MON. `minimumOut` is the floor the payer approved; a worse fill reverts.
 */
export async function swapStable(account: LocalAccount, quote: StableSwapQuote, opts?: { onApproved?: () => void }): Promise<Hex> {
  const chainId = appChainId()
  const wallet = createWalletClient({ account, chain: chainFor(chainId), transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL) })
  const token = stableToken(quote.from).address
  const spender = quote.venue === 'pancake' ? PANCAKE_MAINNET.swapRouter : MENTO_MAINNET.router
  const allowance = await appChain().readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, spender] })
  if (allowance < quote.amountIn) {
    const approval = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, quote.amountIn] })
    const receipt = await appChain().waitForTransactionReceipt({ hash: approval, timeout: 30_000 })
    if (receipt.status !== 'success') throw new Error('The approval did not go through, so nothing was swapped.')
    opts?.onApproved?.()
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_S
  if (quote.venue === 'pancake') {
    return wallet.writeContract({
      address: PANCAKE_MAINNET.swapRouter,
      abi: pancakeSwapRouterAbi,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: token,
          tokenOut: stableToken(quote.to).address,
          fee: STABLE_FEE_TIER,
          recipient: account.address,
          deadline,
          amountIn: quote.amountIn,
          amountOutMinimum: quote.minimumOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })
  }
  return wallet.writeContract({
    address: MENTO_MAINNET.router,
    abi: mentoSwapAbi,
    functionName: 'swapExactTokensForTokens',
    args: [quote.amountIn, quote.minimumOut, mentoRoutes(quote.from, quote.to), account.address, deadline],
  })
}

/** Native MON balance, which is both what a swap spends and what its gas costs. */
export async function readMonBalance(address: Address): Promise<bigint> {
  return appChain().getBalance({ address })
}
