import { isHex } from 'viem'
import { getReceipt } from '@/lib/receipts'
import { receiptToDto } from '@/lib/send-serial'

/** GET /api/receipt/:intentId — one settled receipt read from RateAttestation, or the fixture under NEXT_PUBLIC_FIXTURES=1. */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params
  if (!isHex(intentId) || intentId.length !== 66) {
    return Response.json({ error: 'intentId must be a 32-byte hex string' }, { status: 400 })
  }
  try {
    const receipt = await getReceipt(intentId)
    if (!receipt) return Response.json({ error: 'No receipt for that intent' }, { status: 404 })
    return Response.json(receiptToDto(receipt), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return Response.json({ error: `Could not read the receipt (${(e as Error).message.split('\n')[0]})` }, { status: 502 })
  }
}
