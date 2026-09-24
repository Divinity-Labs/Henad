import Link from 'next/link'
import { money, spreadLine, tokens } from '@/lib/format'
import type { Receipt } from '@/lib/receipts'
import { ledgerStamp, pad2, settled } from './ledger'

// 810px of fixed columns plus 72px of padding: the table scrolls inside .scroll-x
// rather than pushing the page sideways, and below lg the mobile list is shown instead.
const cols = 'grid grid-cols-[40px_150px_90px_minmax(140px,1fr)_150px_120px] gap-4 items-center px-9'
const LEDGER_MIN_W = 'min-w-[882px]'

function amount(r: Receipt) {
  return `${money(r.sourceAmount, r.sourceAsset.decimals, '$')} → ${tokens(r.deliveredAmount, r.targetAsset.decimals, r.targetAsset.symbol, r.corridor.currencyDp)}`
}
function spread(r: Receipt) {
  return spreadLine(r.spreadCost, r.targetAsset.decimals, r.corridor.targetSymbol, r.spreadBps, { dp: r.corridor.currencyDp })
}
function number(r: Receipt) {
  return r.index === null ? '—' : pad2(r.index)
}

/**
 * The W2 Settlements block: heading, caption, the hairline ledger (newest
 * first, every row a permalink to its receipt) and the closing line. Below md
 * the six columns fold into a two-line row so /receipts reads at 360px.
 */
export function SettlementsBlock({ receipts, title = 'Settlements', heading: Heading = 'h2' }: { receipts: Receipt[]; title?: string; heading?: 'h1' | 'h2' }) {
  const rows = [...receipts].reverse()
  const newest = rows[0]
  const sample = receipts.some((r) => r.sample)
  const whole = !newest || newest.index === null || newest.index === receipts.length
  const real = settled(receipts)
  const latest = real[real.length - 1]
  const next = (latest?.index ?? real.length) + 1
  return (
    <section className="flex flex-col pt-5 pb-2 md:pt-6">
      <div className="flex items-baseline justify-between px-4 pb-2 md:px-9 md:pb-3">
        <Heading className="m-0 font-display text-[17px] font-medium tracking-[-.02em] md:text-[20px]">{title}</Heading>
        <span className="font-mono text-[9px] tracking-[.08em] uppercase text-muted md:text-[11px]">{sample ? 'Sample · not a settlement' : 'Live · every receipt is a permalink'}</span>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-hairline px-4 py-7 font-mono text-[11px] leading-[1.6] text-muted md:px-9">
          No settlements yet.{' '}
          <Link href="/send" className="text-ink">
            Be settlement #1 →
          </Link>
        </p>
      ) : (
        <>
          <div className="scroll-x hidden lg:block">
            <div className={LEDGER_MIN_W}>
            <div className={`${cols} label border-t border-b border-hairline py-[10px] text-muted`}>
              <span>#</span>
              <span>Settled</span>
              <span>Corridor</span>
              <span>Amount</span>
              <span className="text-right">Spread</span>
              <span className="text-right">Receipt</span>
            </div>
            {rows.map((r) => (
              <div key={r.intentId} className={`${cols} tabular border-b border-hairline-2 py-[14px] font-mono text-[12px]`}>
                <span className="text-muted">{number(r)}</span>
                <span>{ledgerStamp(r.settledAt)}</span>
                <span>{r.corridor.key}</span>
                <span>{amount(r)}</span>
                <span className="text-right">{spread(r)}</span>
                <Link href={`/receipt/${r.intentId}`} className="text-right text-purple">
                  {r.sample ? 'Sample receipt' : 'Receipt'} ↗
                </Link>
              </div>
            ))}
            </div>
          </div>
          <ul className="m-0 list-none p-0 lg:hidden">
            {rows.map((r) => (
              <li key={r.intentId} className="border-t border-hairline-2 first:border-t-hairline last:border-b last:border-b-hairline">
                <Link href={`/receipt/${r.intentId}`} className="tabular grid grid-cols-[28px_1fr_auto] items-center gap-[10px] px-4 py-3 font-mono text-[11px] text-ink">
                  <span className="text-muted">{number(r)}</span>
                  <span className="flex flex-col gap-[3px]">
                    <span>{amount(r)}</span>
                    <span className="text-[10px] text-muted">
                      {r.corridor.key} · {ledgerStamp(r.settledAt)}
                      {r.sample ? ' · sample' : ''}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-[3px]">
                    <span className="font-medium">{spread(r)}</span>
                    <span className="text-[10px] text-purple">Receipt ↗</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 px-4 pt-6 pb-4 font-mono text-[11px] leading-[1.6] text-muted md:flex-row md:items-center md:justify-between md:gap-6 md:px-9 md:pt-7 md:pb-5">
            <span className="max-w-[420px]">
              {whole
                ? 'That is the whole ledger. The next settlement appears here within a second of finality.'
                : `Showing the latest ${receipts.length} of ${newest.index} settlements.`}
            </span>
            <Link href="/send" className="text-[11px] tracking-[.06em] uppercase whitespace-nowrap text-ink">
              Be settlement #{next} →
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
