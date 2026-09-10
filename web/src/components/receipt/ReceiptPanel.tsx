import type { Receipt } from '@/lib/receipts'
import { shortHash } from '@/lib/format'
import { ReceiptSlip } from '@/components/ReceiptSlip'

/**
 * The one dark cinematic panel of the receipt page: purple radial over grain,
 * the spread in basis points as giant ghost type, the slip, and the permalink
 * line. Server-safe. `host` is the request host, shown as typed in the address
 * bar; nothing is hardcoded.
 */
export function ReceiptPanel({ receipt, host }: { receipt: Receipt; host: string }) {
  const ghost = receipt.spreadBps < 0 ? `−${-receipt.spreadBps}` : String(receipt.spreadBps)
  const path = `/receipt/${shortHash(receipt.intentId)}`
  return (
    <div className="grain relative flex flex-col items-center gap-[22px] overflow-hidden bg-dark bg-[radial-gradient(ellipse_90%_80%_at_20%_110%,var(--color-dark-3)_0%,var(--color-dark-2)_45%,var(--color-dark)_100%)] px-4 py-10 md:px-6 md:py-12 lg:px-12 xl:px-20 xl:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-[10px] select-none font-display text-[160px] leading-none font-semibold tracking-[-.06em] whitespace-nowrap text-white/6 md:-bottom-[60px] md:text-[300px]"
      >
        {ghost}
      </div>
      <div className="relative w-full max-w-[400px] shadow-[0_40px_80px_-20px_rgba(0,0,0,.6)]">
        {/* md below lg: the side-by-side panel is too narrow for the 12px lg slip */}
        <ReceiptSlip receipt={receipt} size="md" className="lg:hidden" />
        <ReceiptSlip receipt={receipt} size="lg" className="hidden lg:block" />
      </div>
      <div className="relative flex flex-wrap items-center justify-center gap-[10px] font-mono text-[11px] tracking-[.08em] text-lilac-2">
        <span>
          {host}
          {path}
        </span>
        <span className="text-white/30">·</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/monad-full-white.svg" alt="Monad" className="block h-3 w-auto opacity-70" />
      </div>
    </div>
  )
}
