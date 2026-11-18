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

export type StableVenue = 'pancake' | 'mento' | 'relay'

// ── Relay ───────────────────────────────────────────────────────────────────────────────────
//
// Relay's solver quote, the same engine behind Agora's Via conversion API. Measured 18 Nov 2026
// on Monad: 1,000.03 AUSD for 1,000 USDC, against Mento's 999.13. The quote arrives as
// transactions to sign, so every one is checked before it can be signed: the right chain,
// no MON attached, an approval of exactly the input token to Relay's router and nothing
// else, and a swap sent to that router that pays this account. Anything unexpected drops
// Relay from the comparison instead of reaching the wallet.

const RELAY_API = 'https://api.relay.link'
/** Relay's router on Monad, read from its quotes on 18 Nov 2026. A different one fails closed. */
const RELAY_ROUTER: Address = '0x5567954cd026cebfe486062cb75848e0f1c12e58'
const APPROVE_SELECTOR = '0x095ea7b3'

interface RelayTx {
  to: Address
  data: Hex
  value: string
  chainId: number
}

interface RelayQuote {
  amountOut: bigint
  minimumOut: bigint
  txs: { kind: 'approve' | 'swap'; tx: RelayTx }[]
}

async function quoteRelay(
  amountIn: bigint,
  from: SourceAssetSymbol,
  to: SourceAssetSymbol,
  user: Address,
  slippageBps: number,
): Promise<RelayQuote> {
  const chainId = appChainId()
  const fromToken = stableToken(from).address.toLowerCase()
  const res = await fetch(`${RELAY_API}/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      user,
      recipient: user,
      originChainId: chainId,
      destinationChainId: chainId,
      originCurrency: stableToken(from).address,
      destinationCurrency: stableToken(to).address,
      amount: amountIn.toString(),
      tradeType: 'EXACT_INPUT',
      slippageTolerance: String(slippageBps),
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Relay quote failed (${res.status})`)
  const body = (await res.json()) as {
    steps?: { id: string; kind: string; items: { data: RelayTx }[] }[]
    details?: { currencyOut?: { amount?: string; minimumAmount?: string } }
  }
  const out = body.details?.currencyOut
  if (!out?.amount || !out.minimumAmount) throw new Error('Relay quote has no output')

  const userWord = user.slice(2).toLowerCase()
  const txs: RelayQuote['txs'] = []
  for (const step of body.steps ?? []) {
    if (step.kind !== 'transaction') throw new Error(`Unexpected Relay step: ${step.kind}`)
    for (const { data: tx } of step.items) {
      if (Number(tx.chainId) !== chainId || BigInt(tx.value || '0') !== 0n) throw new Error('Relay tx has the wrong chain or carries MON')
      const target = tx.to.toLowerCase()
      const data = tx.data.toLowerCase()
      if (step.id === 'approve') {
        // approve(spender, amount): only the input token, only Relay's router, never above the input.
        const spender = `0x${data.slice(34, 74)}`
        const amount = BigInt(`0x${data.slice(74, 138)}`)
        if (target !== fromToken || !data.startsWith(APPROVE_SELECTOR) || spender !== RELAY_ROUTER || amount > amountIn) {
          throw new Error('Relay approval does not match the swap')
        }
        txs.push({ kind: 'approve', tx })
      } else if (step.id === 'swap') {
        if (target !== RELAY_ROUTER || !data.includes(userWord)) throw new Error('Relay swap does not pay this account')
        txs.push({ kind: 'swap', tx })
      } else {
        throw new Error(`Unexpected Relay step: ${step.id}`)
      }
    }
  }
  if (txs.filter((t) => t.kind === 'swap').length !== 1) throw new Error('Relay quote has no single swap')
  return { amountOut: BigInt(out.amount), minimumOut: BigInt(out.minimumAmount), txs }
}

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

const VENUE_LABEL: Record<StableVenue, string> = {
  pancake: 'PancakeSwap 0.01% pool',
  mento: 'Mento, via USDm',
  relay: 'Relay',
}

/**
 * Every venue at once; the best fill wins. Rejects only when none can quote. Relay needs the
 * account it will pay, so it joins only when `user` is known.
 */
export async function quoteStableSwap(
  amountIn: bigint,
  from: SourceAssetSymbol,
  to: SourceAssetSymbol,
  slippageBps = 50,
  user?: Address,
): Promise<StableSwapQuote> {
  const [pancake, mento, relay] = await Promise.allSettled([
    quotePancakeStable(amountIn, from, to),
    quoteMentoStable(amountIn, from, to),
    user ? quoteRelay(amountIn, from, to, user, slippageBps) : Promise.reject(new Error('no user')),
  ])
  const outs: [StableVenue, bigint][] = [
    ['pancake', pancake.status === 'fulfilled' ? pancake.value : -1n],
    ['mento', mento.status === 'fulfilled' ? mento.value : -1n],
    ['relay', relay.status === 'fulfilled' ? relay.value.amountOut : -1n],
  ]
  const [venue, amountOut] = outs.reduce((best, next) => (next[1] > best[1] ? next : best))
  if (amountOut <= 0n) throw new Error('No venue can quote this swap right now.')
  // For Relay the floor shown is the one written into its calldata, not one computed here.
  const minimumOut =
    venue === 'relay' && relay.status === 'fulfilled' ? relay.value.minimumOut : (amountOut * BigInt(10_000 - slippageBps)) / 10_000n
  return { from, to, amountIn, amountOut, minimumOut, slippageBps, venue, venueLabel: VENUE_LABEL[venue] }
}

/**
 * Swap one stablecoin for the other, from the payer's own account: an exact approval for the
 * chosen venue when the current one is short, then the swap. Two transactions at most, both
 * paid in MON. `minimumOut` is the floor the payer approved; a worse fill reverts.
 */
export async function swapStable(account: LocalAccount, quote: StableSwapQuote, opts?: { onApproved?: () => void }): Promise<Hex> {
  const chainId = appChainId()
  const wallet = createWalletClient({ account, chain: chainFor(chainId), transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL) })
  if (quote.venue === 'relay') return swapViaRelay(wallet, account, quote, opts)
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

/**
 * Relay quotes expire within seconds, so the one shown is re-asked at signing time. The fresh
 * one must still meet the floor the payer approved, and its swap is dry-run after the approval
 * so a transaction that would revert is never sent.
 */
async function swapViaRelay(
  wallet: ReturnType<typeof createWalletClient>,
  account: LocalAccount,
  quote: StableSwapQuote,
  opts?: { onApproved?: () => void },
): Promise<Hex> {
  // Asked with 0.1% less slippage, so small drift between the two quotes still clears the floor shown.
  const fresh = await quoteRelay(quote.amountIn, quote.from, quote.to, account.address, Math.max(quote.slippageBps - 10, 1))
  if (fresh.minimumOut < quote.minimumOut) throw new Error('The price moved since the quote. Check the new one and try again.')
  const chain = chainFor(appChainId())
  let swapHash: Hex | null = null
  for (const { kind, tx } of fresh.txs) {
    if (kind === 'approve') {
      const token = stableToken(quote.from).address
      const allowance = await appChain().readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, RELAY_ROUTER] })
      if (allowance >= quote.amountIn) continue
      const hash = await wallet.sendTransaction({ account, chain, to: tx.to, data: tx.data, value: 0n })
      const receipt = await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
      if (receipt.status !== 'success') throw new Error('The approval did not go through, so nothing was swapped.')
      opts?.onApproved?.()
    } else {
      await appChain().call({ account: account.address, to: tx.to, data: tx.data, value: 0n })
      swapHash = await wallet.sendTransaction({ account, chain, to: tx.to, data: tx.data, value: 0n })
    }
  }
  if (!swapHash) throw new Error('Relay returned no swap to sign.')
  return swapHash
}

/** Native MON balance, which is both what a swap spends and what its gas costs. */
export async function readMonBalance(address: Address): Promise<bigint> {
  return appChain().getBalance({ address })
}
