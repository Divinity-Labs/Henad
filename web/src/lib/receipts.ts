import type { Address, Hex } from 'viem'
import { parseAbiItem } from 'viem'
import { HENAD, rateAttestationAbi, spreadCost } from '@henad/core'
import { appChain, appChainId } from './chain'
import { CORRIDORS, corridorById, type Corridor } from './corridors'
import { SAMPLE_RECEIPT, fixturesEnabled } from './fixtures'

/** A settled payout as the product shows it. Every figure is read from the chain. */
export interface Receipt {
  intentId: Hex
  /** 1-based settlement number in the ledger, when known */
  index: number | null
  corridor: Corridor
  payer: Address
  recipient: Address
  sourceAsset: { symbol: string; address: Address; decimals: number }
  targetAsset: { symbol: string; address: Address; decimals: number }
  sourceAmount: bigint
  deliveredAmount: bigint
  referenceRate: bigint
  executedRate: bigint
  spreadBps: number
  /** Pounds (target base units) lost to spread: delivered at reference minus delivered */
  spreadCost: bigint
  rateSource: Address
  referenceObservation: Hex
  venue: Address
  settledAt: number
  settledAtBlock: bigint
  txHash: Hex | null
  /** true only for the design fixture; never shown as real */
  sample: boolean
}

export function deploymentAddresses() {
  return HENAD[appChainId()] ?? null
}

const payoutSettledEvent = parseAbiItem(
  'event PayoutSettled(bytes32 indexed intentId, bytes32 indexed corridor, address indexed payer, address recipient, address sourceAsset, address targetAsset, (bytes32 corridor, bytes32 referenceObservation, uint128 referenceRate, uint128 executedRate, uint128 sourceAmount, uint128 deliveredAmount, address rateSource, int32 spreadBps, uint64 settledAt, address venue, uint64 settledAtBlock) a)',
)

function assetInfo(address: Address) {
  const all = [
    { symbol: 'AUSD', decimals: 6 },
    { symbol: 'USDC', decimals: 6 },
    ...CORRIDORS.filter((c) => c.targetAsset).map((c) => ({ symbol: c.targetAsset!.symbol, decimals: c.targetAsset!.decimals, address: c.targetAsset!.address })),
  ]
  const byAddr = (a: string) => all.find((x) => 'address' in x && (x as { address: string }).address.toLowerCase() === a.toLowerCase())
  const known = byAddr(address)
  return { symbol: known?.symbol ?? 'token', address, decimals: known?.decimals ?? 18 }
}

/** Read one receipt from RateAttestation plus its event (single-block log query). */
export async function getReceipt(intentId: Hex): Promise<Receipt | null> {
  const dep = deploymentAddresses()
  if (!dep) return fixturesEnabled() && intentId.toLowerCase() === SAMPLE_RECEIPT.intentId.toLowerCase() ? SAMPLE_RECEIPT : null
  const client = appChain()
  const a = await client.readContract({ address: dep.rateAttestation, abi: rateAttestationAbi, functionName: 'get', args: [intentId] })
  if (a.settledAt === 0n) return null
  const logs = await client.getLogs({
    address: dep.rateAttestation,
    event: payoutSettledEvent,
    args: { intentId },
    fromBlock: a.settledAtBlock,
    toBlock: a.settledAtBlock,
  })
  const log = logs[0]
  const corridor = corridorById(a.corridor as Hex)
  if (!log || !corridor) return null
  const src = assetInfo(log.args.sourceAsset!)
  const dst = assetInfo(log.args.targetAsset!)
  return {
    intentId,
    index: null,
    corridor,
    payer: log.args.payer!,
    recipient: log.args.recipient!,
    sourceAsset: src,
    targetAsset: dst,
    sourceAmount: a.sourceAmount,
    deliveredAmount: a.deliveredAmount,
    referenceRate: a.referenceRate,
    executedRate: a.executedRate,
    spreadBps: a.spreadBps,
    spreadCost: spreadCost(a.referenceRate, a.sourceAmount, src.decimals, a.deliveredAmount, dst.decimals),
    rateSource: a.rateSource,
    referenceObservation: a.referenceObservation as Hex,
    venue: a.venue,
    settledAt: Number(a.settledAt),
    settledAtBlock: a.settledAtBlock,
    txHash: log.transactionHash,
    sample: false,
  }
}

/** The whole ledger, newest last. Pages through RateAttestation.intentIdAt without an indexer. */
export async function listReceipts(limit = 50): Promise<Receipt[]> {
  const dep = deploymentAddresses()
  if (!dep) return fixturesEnabled() ? [SAMPLE_RECEIPT] : []
  const client = appChain()
  const count = Number(await client.readContract({ address: dep.rateAttestation, abi: rateAttestationAbi, functionName: 'count' }))
  const from = Math.max(0, count - limit)
  const ids = await Promise.all(
    Array.from({ length: count - from }, (_, i) =>
      client.readContract({ address: dep.rateAttestation, abi: rateAttestationAbi, functionName: 'intentIdAt', args: [BigInt(from + i)] }),
    ),
  )
  const receipts = await Promise.all(ids.map((id) => getReceipt(id as Hex)))
  const out: Receipt[] = []
  receipts.forEach((r, i) => {
    if (r) out.push({ ...r, index: from + i + 1 })
  })
  return out
}

export interface LedgerTotals {
  settlements: number
  /** per target currency: delivered and spread cost, base units (18 dec for Mento stables) */
  byCurrency: Record<string, { delivered: bigint; spreadCost: bigint; symbol: string; decimals: number; count: number; spreadBpsSum: number }>
}

export function totals(receipts: Receipt[]): LedgerTotals {
  const byCurrency: LedgerTotals['byCurrency'] = {}
  for (const r of receipts) {
    const k = r.corridor.target
    byCurrency[k] ??= { delivered: 0n, spreadCost: 0n, symbol: r.corridor.targetSymbol, decimals: r.targetAsset.decimals, count: 0, spreadBpsSum: 0 }
    byCurrency[k].delivered += r.deliveredAmount
    byCurrency[k].spreadCost += r.spreadCost
    byCurrency[k].count += 1
    byCurrency[k].spreadBpsSum += r.spreadBps
  }
  return { settlements: receipts.length, byCurrency }
}
