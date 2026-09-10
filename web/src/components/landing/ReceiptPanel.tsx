import { ReceiptSlip } from '@/components/ReceiptSlip'
import type { Receipt } from '@/lib/receipts'

const FIELDS = [
  ['referenceRate', 'What Chainlink published at that block'],
  ['executedRate', 'What the recipient actually got'],
  ['spreadBps', 'Signed. Negative means better than reference'],
  ['rateSource', 'The contract address the rate was read from'],
] as const

const RADIAL = 'radial-gradient(ellipse 90% 80% at 30% 110%, #4B37C9 0%, #23185E 45%, #17171B 100%)'
const RADIAL_M = 'radial-gradient(ellipse 100% 70% at 30% 110%, #4B37C9 0%, #23185E 45%, #17171B 100%)'

/**
 * The one dark cinematic panel on the page: the receipt's field list beside
 * the slip on a purple radial. `ghost` is the latest settlement's spread in
 * bps, or "—" before the first one.
 */
export function ReceiptPanel({ slip, ghost }: { slip: Receipt; ghost: string }) {
  return (
    <section className="hidden md:grid grid-cols-2 overflow-hidden grain bg-dark text-white" aria-labelledby="receipt-heading">
      <div className="flex flex-col justify-center gap-[22px] py-[88px] pl-9 pr-12 border-r border-white/8">
        <p className="m-0 font-mono uppercase text-[11px] tracking-[.12em] text-lilac-2">The receipt</p>
        <h2 id="receipt-heading" className="m-0 font-display font-medium text-[44px] tracking-[-.03em] leading-[1.05] pretty">
          One artifact that reflects the whole corridor.
        </h2>
        <p className="m-0 text-[17px] leading-[1.6] text-dim pretty">
          A PayoutSettled event, emitted in the same transaction that moved the funds. No admin key can alter it. Every rate on it names an
          addressable source.
        </p>
        <dl className="m-0 mt-2 flex flex-col font-mono text-[12px]">
          {FIELDS.map(([k, v], i) => (
            <div key={k} className={`grid grid-cols-[150px_1fr] gap-4 py-3 border-t border-white/10 ${i === FIELDS.length - 1 ? 'border-b' : ''}`}>
              <dt className="text-lilac-2">{k}</dt>
              <dd className="m-0 text-dim-2">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative flex items-center justify-center px-9 py-[72px]" style={{ background: RADIAL }}>
        <div
          aria-hidden="true"
          className="absolute left-[-8px] bottom-[-70px] font-display font-semibold text-[340px] leading-none tracking-[-.06em] text-white/6 whitespace-nowrap pointer-events-none select-none tabular"
        >
          {ghost}
        </div>
        <ReceiptSlip receipt={slip} size="lg" showSent={false} className="w-[380px] shadow-[0_40px_80px_-20px_rgba(0,0,0,.6)]" />
      </div>
    </section>
  )
}

/** The mobile canvas keeps only the statement: a rounded dark card with the ghost figure. */
export function ReceiptCard({ ghost }: { ghost: string }) {
  return (
    <section className="flex md:hidden relative overflow-hidden grain mx-3 mt-3 rounded-[16px] bg-dark text-white px-5 py-6 flex-col gap-3" style={{ backgroundImage: RADIAL_M }}>
      <div
        aria-hidden="true"
        className="absolute right-[-8px] bottom-[-40px] font-display font-semibold text-[180px] leading-none tracking-[-.06em] text-white/6 pointer-events-none select-none tabular"
      >
        {ghost}
      </div>
      <p className="relative m-0 label text-lilac-2">The receipt</p>
      <h2 className="relative m-0 font-display font-medium text-[26px] tracking-[-.03em] leading-[1.05] pretty">One artifact that reflects the whole corridor.</h2>
      <p className="relative m-0 text-[13px] leading-[1.55] text-dim">A PayoutSettled event in the same transaction that moved the funds. No admin key can alter it.</p>
    </section>
  )
}
