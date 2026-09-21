import { decodeEventLog, type Address, type Hex } from 'viem'
import { rateAttestationAbi } from '@henad/core'

/**
 * The whole ledger in one request, from Envio's HyperSync.
 *
 * Reading receipts over a public RPC costs about three calls each — `intentIdAt`, `get`,
 * and a single-block `getLogs` — so a fifty-row ledger is a hundred and fifty round trips,
 * and Monad's public node caps `eth_getLogs` at a hundred blocks, which rules out asking
 * for the range in one go. HyperSync answers the same question in one POST over the whole
 * chain, and the `PayoutSettled` event already carries the full attestation, so nothing
 * needs a follow-up read.
 *
 * It is an accelerator, never a dependency: every caller falls back to the RPC path when
 * the token is missing or the service is unreachable. The figures are identical either
 * way — the same event, decoded with the same ABI.
 */

/** Monad mainnet 143, testnet 10143. https://envio.dev/chains/monad */
function endpoint(chainId: number): string {
  return `https://${chainId}.hypersync.xyz/query`
}

/** keccak of PayoutSettled(bytes32,bytes32,address,address,address,address,(…)). */
const PAYOUT_SETTLED_TOPIC = '0xdb59fb20f2cf82ecd5070c19e5eb4782ca836abd13bce31ca53da4cba0cfe1bc' as const

/** A page of HyperSync's answer. `data` is a list of batches, each with the rows it matched. */
interface QueryResponse {
  data?: { logs?: RawLog[] }[]
  next_block?: number
  archive_height?: number
}

interface RawLog {
  data: Hex
  topic0?: Hex
  topic1?: Hex
  topic2?: Hex
  topic3?: Hex
  transaction_hash?: Hex
  block_number?: number
  log_index?: number
}

export interface SettlementLog {
  intentId: Hex
  corridor: Hex
  payer: Address
  recipient: Address
  sourceAsset: Address
  targetAsset: Address
  attestation: {
    corridor: Hex
    referenceObservation: Hex
    referenceRate: bigint
    executedRate: bigint
    sourceAmount: bigint
    deliveredAmount: bigint
    rateSource: Address
    spreadBps: number
    settledAt: bigint
    venue: Address
    settledAtBlock: bigint
  }
  blockNumber: bigint
  txHash: Hex | null
}

export function hypersyncEnabled(): boolean {
  return Boolean(process.env.ENVIO_API_TOKEN_HS?.trim())
}

/**
 * Every settlement written by this attestation contract, oldest first.
 *
 * Returns null rather than throwing when HyperSync cannot answer, so a caller can fall
 * back to the chain instead of failing the page. A ledger that is late is worse than a
 * ledger that came from a slower road.
 */
export async function settlementLogs(
  chainId: number,
  attestation: Address,
  fromBlock: bigint,
  signal?: AbortSignal,
): Promise<SettlementLog[] | null> {
  const token = process.env.ENVIO_API_TOKEN_HS?.trim()
  if (!token) return null

  const out: SettlementLog[] = []
  let cursor = Number(fromBlock)
  // HyperSync answers in batches and hands back where to resume. The guard is a page count,
  // not a timeout: a ledger this size is one or two pages, and a loop that cannot end is
  // worse than a ledger that stops early.
  for (let page = 0; page < 20; page++) {
    const body = {
      from_block: cursor,
      logs: [{ address: [attestation], topics: [[PAYOUT_SETTLED_TOPIC]] }],
      field_selection: {
        log: ['data', 'topic0', 'topic1', 'topic2', 'topic3', 'transaction_hash', 'block_number', 'log_index'],
      },
    }
    let answer: QueryResponse
    try {
      const res = await fetch(endpoint(chainId), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal,
        cache: 'no-store',
      })
      if (!res.ok) return null
      answer = (await res.json()) as QueryResponse
    } catch {
      return null
    }

    for (const batch of answer.data ?? []) {
      for (const log of batch.logs ?? []) {
        const decoded = decode(log)
        if (decoded) out.push(decoded)
      }
    }

    const next = answer.next_block ?? 0
    const height = answer.archive_height ?? 0
    if (!next || next <= cursor || next > height) break
    cursor = next
  }
  return out
}

/** One raw row into the event's fields, or null when it is not a PayoutSettled we can read. */
function decode(log: RawLog): SettlementLog | null {
  if (!log.topic0 || !log.topic1 || !log.topic2 || !log.topic3) return null
  try {
    const { args } = decodeEventLog({
      abi: rateAttestationAbi,
      eventName: 'PayoutSettled',
      data: log.data,
      topics: [log.topic0, log.topic1, log.topic2, log.topic3],
    })
    const a = args as unknown as {
      intentId: Hex
      corridor: Hex
      payer: Address
      recipient: Address
      sourceAsset: Address
      targetAsset: Address
      a: SettlementLog['attestation']
    }
    return {
      intentId: a.intentId,
      corridor: a.corridor,
      payer: a.payer,
      recipient: a.recipient,
      sourceAsset: a.sourceAsset,
      targetAsset: a.targetAsset,
      attestation: a.a,
      blockNumber: BigInt(log.block_number ?? 0),
      txHash: log.transaction_hash ?? null,
    }
  } catch {
    // A log this ABI cannot read is not this contract's, whatever the topic says.
    return null
  }
}
