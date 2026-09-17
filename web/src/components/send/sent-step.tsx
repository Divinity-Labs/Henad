'use client'

import type { Receipt } from '@/lib/receipts'
import { ReceiptSlip } from '@/components/ReceiptSlip'
import { Button } from '@/components/ui/Button'
import { Notice } from './send-ui'

/**
 * S3. The toast slides in, the printer head sits above the slot, the receipt
 * feeds out and the stamp lands. A fixture receipt keeps its "Sample" label and
 * the toast says so; it is never presented as a payout.
 */
export function SentStep({
  receipt,
  explorerTx,
  maxSpreadBps,
  notice,
  onShare,
  onAgain,
}: {
  receipt: Receipt
  explorerTx: string | null
  /** the cap the payer approved; null for the fixture, which has none */
  maxSpreadBps: number | null
  notice: string | null
  onShare: () => void
  onAgain: () => void
}) {
  const sample = receipt.sample
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">{sample ? 'Sample receipt' : 'Payout sent'}</h1>
      <div className="overflow-hidden px-4 pt-[10px]">
        <div role="status" className="motion animate-toast flex h-11 items-center gap-[10px] rounded-[6px] bg-dark px-[14px] font-mono text-[11px] uppercase tracking-[.08em] text-white">
          <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${sample ? 'bg-amber' : 'bg-cyan'}`} />
          {sample ? 'Sample receipt' : 'Payout sent'}
          <span className="ml-auto normal-case tracking-normal text-dim">{sample ? 'nothing was sent' : 'final in 0.6 s'}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-4">
        <div aria-hidden className="relative z-[2] h-[14px] rounded-t-[6px] bg-dark">
          <div className="absolute left-[14px] right-[14px] top-[5px] h-[2px] rounded-[1px] bg-purple" />
        </div>
        <div className="overflow-hidden pb-6">
          <ReceiptSlip receipt={receipt} size="md" animate maxSpreadBps={maxSpreadBps ?? undefined} />
        </div>
        <div className="flex-1" />
        {notice && <Notice tone="info">{notice}</Notice>}
        <div className="flex gap-2 pb-4 pt-2">
          <Button variant="primary" size="xl" className="flex-1" onClick={onShare}>
            Share receipt
          </Button>
          {explorerTx ? (
            <Button variant="secondary" size="xl" className="flex-1" href={explorerTx} external>
              Monadscan ↗
            </Button>
          ) : (
            <Button variant="disabled" size="xl" className="flex-1">
              Monadscan ↗
            </Button>
          )}
        </div>
        <div className="flex gap-2 pb-4">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onAgain}>
            Send another
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" href="/receipts">
            All receipts
          </Button>
        </div>
      </div>
    </div>
  )
}
