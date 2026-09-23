import { createWalletClient, erc20Abi, http, type Address, type Hex, type LocalAccount } from 'viem'
import { TOKENS, UPSHIFT_MAINNET, chainFor, upshiftVaultAbi } from '@henad/core'
import { appChain, appChainId } from './config'

/**
 * Earn from the phone: idle AUSD into Upshift's earnAUSD vault, and back out.
 *
 * Mirrors web/src/lib/earn.ts, including what it refuses to do. The yield accrues in the
 * share price rather than in a balance, the shares stay in the payer's own account, and the
 * rate the screen shows is worked out from the vault's own share price a week ago rather
 * than from a number somebody published.
 */

const ONE = 1_000_000n

export function vaultAddresses() {
  const ausd = TOKENS[appChainId()].AUSD
  if (!ausd) throw new Error(`No AUSD address for chain ${appChainId()}`)
  return { ...UPSHIFT_MAINNET, ausd: ausd.address }
}

export interface EarnState {
  shares: bigint
  /** What those shares are worth in AUSD before any exit fee. */
  value: bigint
  sharePrice: bigint
  totalAssets: bigint
  instantFeeBps: number
  depositsPaused: boolean
  withdrawalsPaused: boolean
  apy: { rate: number; days: number } | null
}

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
 * What the vault has actually paid, annualised from its own share price.
 *
 * Monad's public node keeps roughly nine days of historical state, so the window is a week.
 * When the older read fails the screen says nothing rather than inventing a figure.
 */
async function trailingApy(now: bigint): Promise<{ rate: number; days: number } | null> {
  const v = vaultAddresses()
  const client = appChain()
  const head = await client.getBlockNumber()
  const past = head - 1_500_000n
  if (past <= 0n) return null
  const [thenPrice, headBlock, pastBlock] = await Promise.all([
    client.readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'getSharePrice', blockNumber: past }),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: past }),
  ])
  const seconds = Number(headBlock.timestamp - pastBlock.timestamp)
  if (thenPrice <= 0n || seconds <= 0) return null
  const days = seconds / 86_400
  return { rate: (Number(now) / Number(thenPrice)) ** (365 / days) - 1, days }
}

export async function previewDeposit(amount: bigint): Promise<bigint> {
  const v = vaultAddresses()
  return appChain().readContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'previewDeposit', args: [v.ausd, amount] })
}

/** AUSD returned for these shares if redeemed now, after the instant-exit fee. */
export function redeemValue(shares: bigint, sharePrice: bigint, instantFeeBps: number): bigint {
  return (((shares * sharePrice) / ONE) * BigInt(10_000 - instantFeeBps)) / 10_000n
}

function wallet(account: LocalAccount, rpcUrl?: string) {
  return createWalletClient({ account, chain: chainFor(appChainId()), transport: http(rpcUrl) })
}

export async function readVaultAllowance(owner: Address): Promise<bigint> {
  const v = vaultAddresses()
  return appChain().readContract({ address: v.ausd, abi: erc20Abi, functionName: 'allowance', args: [owner, v.vault] })
}

/** Approve exactly this deposit. The vault is upgradeable, so no standing allowance. */
export async function approveVault(account: LocalAccount, amount: bigint, rpcUrl?: string): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account, rpcUrl).writeContract({ address: v.ausd, abi: erc20Abi, functionName: 'approve', args: [v.vault, amount] })
}

export async function depositAusd(account: LocalAccount, amount: bigint, rpcUrl?: string): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account, rpcUrl).writeContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'deposit', args: [v.ausd, amount, account.address] })
}

export async function redeemShares(account: LocalAccount, shares: bigint, rpcUrl?: string): Promise<Hex> {
  const v = vaultAddresses()
  return wallet(account, rpcUrl).writeContract({ address: v.vault, abi: upshiftVaultAbi, functionName: 'instantRedeem', args: [shares, account.address] })
}
