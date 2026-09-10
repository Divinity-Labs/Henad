import type { Metadata } from 'next'
import { SendFlow } from '@/components/send/send-flow'
import type { SendInitial } from '@/components/send/send-reducer'
import { CORRIDORS, LIVE_CORRIDOR } from '@/lib/corridors'
import { SAMPLE_RECEIPT } from '@/lib/fixtures'
import { liveRates } from '@/lib/rates'
import { listReceipts, type Receipt } from '@/lib/receipts'
import { rateToDto, receiptToDto } from '@/lib/send-serial'

export const metadata: Metadata = { title: 'Send' }

type Search = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

async function settledReceipts(): Promise<Receipt[]> {
  try {
    return await listReceipts()
  } catch {
    return []
  }
}

/** Live rates, the corridor's newest settlement and the server clock, read once per request. */
async function loadInitial(corridorKey: string, demo: SendInitial['demo']): Promise<SendInitial> {
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

/**
 * /send — one route, a client-side step machine. This server shell reads the
 * live reference rates and the newest settlement, and hands them to the client
 * as plain JSON with the server clock. ?to=GBP|EUR|CHF|JPY picks the corridor;
 * ?demo=receipt renders S3 with the fixture receipt (labelled Sample) and
 * ?demo=closed forces the FX-closed state, both for review.
 */
export default async function SendPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const to = (one(sp.to) ?? LIVE_CORRIDOR.target).toUpperCase()
  const demoRaw = one(sp.demo)
  const demo = demoRaw === 'receipt' || demoRaw === 'closed' ? demoRaw : null
  const corridor = CORRIDORS.find((c) => c.target === to) ?? LIVE_CORRIDOR
  const initial = await loadInitial(corridor.key, demo)
  return <SendFlow initial={initial} />
}
