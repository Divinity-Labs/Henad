import { settledReceipts } from '@/lib/receipts'
import { receiptToDto } from '@/lib/send-serial'

/**
 * The ledger for the mobile client's Receipts screen, newest first. Read from the chain per
 * request, the same way /receipts renders it; the design's sample is never included.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const receipts = (await settledReceipts(200)).filter((r) => !r.sample).reverse()
  return Response.json({ receipts: receipts.map(receiptToDto) }, { headers: { 'cache-control': 'no-store' } })
}
