'use client'

import { createWalletClient, erc20Abi, http, type Address, type Hex, type LocalAccount } from 'viem'
import { TOKENS, UPSHIFT_MAINNET, chainFor, upshiftVaultAbi } from '@henad/core'
import { appChain, appChainId } from './chain'

/**
 * Earn: idle AUSD into Upshift's earnAUSD vault, and back out again.
 *
 * The vault lends AUSD across Monad's lending markets and holds the proceeds, so the yield
 * shows up in the share price rather than in a growing balance: 1,000 AUSD buys 958.86
 * shares today, and those shares are worth more AUSD tomorrow. Henad holds none of it. The
 * deposit is signed by the account that owns the money and the shares land in that account.
 *
 * This is not a savings account and the screen must not imply one. The yield comes from
 * lending, it moves, and a vault can lose money. What Henad can do is state the terms it
 * can read — the share price, the exit fee, the trailing return — and leave the rest alone.
 */

export function vaultAddresses() {
  const ausd = TOKENS[appChainId()].AUSD
  if (!ausd) throw new Error(`No AUSD address for chain ${appChainId()}`)
  return { ...UPSHIFT_MAINNET, ausd: ausd.address }
}

export interface EarnState {
  /** Shares held, in 6 decimals. */
  shares: bigint
  /** What those shares are worth in AUSD right now. */
  value: bigint
  /** AUSD per share, 6 decimals: 1_042_895 is 1.042895. */
  sharePrice: bigint
  /** Total AUSD in the vault. */
  totalAssets: bigint
  /** Basis points taken when leaving immediately rather than joining the queue. */
  instantFeeBps: number
  depositsPaused: boolean
  withdrawalsPaused: boolean
  /** Trailing annualised return from the share price, or null when it cannot be read. */
  apy: TrailingApy | null
}

export interface TrailingApy {
  /** Annualised, as a fraction: 0.049 is 4.9%. */
  rate: number
  /** How many days of share price that came from. */
  days: number
}

const ONE = 1_000_000n

/**
 * The vault's terms and this account's position, read from the chain in one pass.
 *
 * `address` may be null, for the signed-out case: the terms are public and worth showing
 * before anyone has an account.
 */
export async function readEarnState(address: Address | null): Promise<EarnState> {
  const v = vaultAddresses()
  const client = appChain()
  const [sharePrice, totalAssets, instantFee, depositsPaused, withdrawalsPaused, shares] = await Promise.all([
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'getSharePrice' }),
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'getTotalAssets' }),
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'instantRedemptionFee' }),
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'depositsPaused' }),
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'withdrawalsPaused' }),
    address ? client.readContract({ address: v.shareToken, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) : Promise.resolve(0n),
  ])
  return {
    shares,
    value: (shares * sharePrice) / ONE,
    sharePrice,
    totalAssets,
    instantFeeBps: Number(instantFee),
    depositsPaused,
    withdrawalsPaused,
    apy: await trailingApy(sharePrice).catch(() => null),
  }
}

/**
 * The return the vault has actually delivered, annualised from its own share price.
 *
 * Read rather than quoted: a published APY is a claim by whoever published it, and this one
 * can be checked by anyone with an RPC. Monad's public node keeps about nine days of
 * historical state, so the window is a week; when the older read fails, the screen says
 * nothing instead of guessing.
 */
async function trailingApy(now: bigint): Promise<TrailingApy | null> {
  const v = vaultAddresses()
  const client = appChain()
  const head = await client.getBlockNumber()
  // ~0.4 s blocks, so 1.5M blocks is a touch under seven days, inside what the node keeps.
  const past = head - 1_500_000n
  if (past <= 0n) return null
  const [thenPrice, headBlock, pastBlock] = await Promise.all([
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'getSharePrice', blockNumber: past }),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: past }),
  ])
  const seconds = Number(headBlock.timestamp - pastBlock.timestamp)
  if (thenPrice <= 0n || seconds <= 0) return null
  const growth = Number(now) / Number(thenPrice)
  const days = seconds / 86_400
  // Compounded, because the share price compounds: a week's growth repeated through a year.
  return { rate: growth ** (365 / days) - 1, days }
}

/** Shares this much AUSD buys, straight from the vault rather than from the share price. */
export async function previewDeposit(amount: bigint): Promise<bigint> {
  const v = vaultAddresses()
  return appChain().readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'previewDeposit', args: [v.ausd, amount] })
}

/** AUSD returned for these shares if they are redeemed now, after the instant-exit fee. */
export function redeemValue(shares: bigint, sharePrice: bigint, instantFeeBps: number): bigint {
  const gross = (shares * sharePrice) / ONE
  return (gross * BigInt(10_000 - instantFeeBps)) / 10_000n
}

function wallet(account: LocalAccount) {
  return createWalletClient({ account, chain: chainFor(appChainId()), transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL) })
}

/** Current allowance for the vault, so the screen can skip an approval nobody needs. */
export async function readVaultAllowance(owner: Address): Promise<bigint> {
  const v = vaultAddresses()
  return appChain().readContract({ address: v.ausd, abi: erc20Abi, functionName: 'allowance', args: [owner, v.vault] })
}

/** Approve exactly this deposit. Not an unlimited allowance: the vault is upgradeable. */
export async function approveVault(account: LocalAccount, amount: bigint): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account).writeContract({ address: v.ausd, abi: erc20Abi, functionName: 'approve', args: [v.vault, amount] })
}

export async function depositAusd(account: LocalAccount, amount: bigint): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account).writeContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'deposit', args: [v.ausd, amount, account.address] })
}

export async function redeemShares(account: LocalAccount, shares: bigint): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account).writeContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'instantRedeem', args: [shares, account.address] })
}
