import { appChainId } from '@/lib/chain'
import { liveRates } from '@/lib/rates'
import { listReceipts } from '@/lib/receipts'
import { rateToDto, receiptToDto, type ReceiptDto } from '@/lib/send-serial'

/**
 * Rates and the ledger summary for the mobile client's /rates and closed-market screens.
 *
 * The phone never reads Chainlink or Mento itself, for the same reason it does not quote
 * itself: a rate read from two places is two answers, and a receipt that disagrees with
 * the rates page is the one thing this product cannot ship. `liveRates()` is the same
 * function the web pages render from, coalesced for 12 s in process.
 *
 * Sample fixtures are excluded from the ledger. A count of settlements that includes the
 * design's example is a number the chain does not have.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const [rates, receipts] = await Promise.all([liveRates(), listReceipts().catch(() => [])])
  const settled = receipts.filter((r) => !r.sample)
  const byCorridor: Record<string, ReceiptDto> = {}
  for (const r of settled) byCorridor[r.corridor.key] = receiptToDto(r) // ascending, so the newest wins
  const last = settled.at(-1)
  return Response.json(
    {
      now: Math.floor(Date.now() / 1000),
      chainId: appChainId(),
      rates: rates.map(rateToDto),
      ledger: { count: settled.length, last: last ? receiptToDto(last) : null, byCorridor },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
