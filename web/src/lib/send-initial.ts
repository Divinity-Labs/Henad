import { CORRIDORS, LIVE_CORRIDOR } from '@henad/core'
import type { SendInitial } from '@/components/send/send-reducer'
import { SAMPLE_RECEIPT } from './fixtures'
import { liveRates } from './rates'
import { settledReceipts } from './receipts'
import { rateToDto, receiptToDto } from './send-serial'

/**
 * What the send flow starts from, shared by /send and /pay/[address]. Server-only: it reads
 * the live rates and the ledger.
 */

export type Search = Record<string, string | string[] | undefined>

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** ?to=GBP|EUR|CHF|JPY, falling back to the live corridor. The flow writes it back as you switch. */
export function corridorFromSearch(sp: Search) {
  const to = (one(sp.to) ?? LIVE_CORRIDOR.target).toUpperCase()
  return CORRIDORS.find((c) => c.target === to) ?? LIVE_CORRIDOR
}

/** Live rates, the corridor's newest settlement and the server clock, read once per request. */
export async function loadInitial(corridorKey: string, demo: SendInitial['demo']): Promise<SendInitial> {
  const [rates, receipts] = await Promise.all([liveRates(), settledReceipts()])
  const latest = receipts.filter((r) => r.corridor.key === corridorKey).at(-1) ?? null
  return {
    now: Date.now(),
    corridorKey,
    rates: rates.map(rateToDto),
    latestReceipt: latest ? receiptToDto(latest) : null,
    demo,
    sampleReceipt: demo === 'receipt' ? receiptToDto(SAMPLE_RECEIPT) : null,
  }
}
