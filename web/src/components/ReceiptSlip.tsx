import type { Receipt } from '@/lib/receipts'
import { HenadMark } from './ui/HenadMark'
import { blockNumber, money, rateLine, shortAddress, shortHash, spreadLine, utcStamp, utcTime } from '@/lib/format'

type Size = 'sm' | 'md' | 'lg'

/**
 * The hero artifact: a paper settlement receipt with a torn bottom edge.
 * Rendered from a Receipt read off the chain. `animate` plays the one
 * orchestrated motion moment (feed in, then stamp) used on the confirmation
 * screen; everything else is static. Server-safe: no hooks.
 */
export function ReceiptSlip({
  receipt,
  size = 'md',
  animate = false,
  compact = false,
  showSent = true,
  showMeta = true,
  maxSpreadBps,
  className = '',
}: {
  receipt: Receipt
  size?: Size
  animate?: boolean
  /** mobile hero variant: fewer rows, smaller type */
  compact?: boolean
  showSent?: boolean
  showMeta?: boolean
  maxSpreadBps?: number
  className?: string
}) {
  const r = receipt
  const c = r.corridor
  const dp = c.currencyDp
  const s = {
    sm: { pad: 'px-4 pt-[14px] pb-[22px]', gap: 'gap-[7px]', text: 'text-[10px]', brand: 'text-[15px]', mark: 16, big: 'text-[24px]', tooth: '5px', radius: 'rounded-t-[10px]' },
    md: { pad: 'px-4 pt-4 pb-[26px]', gap: 'gap-[9px]', text: 'text-[11px]', brand: 'text-[16px]', mark: 17, big: 'text-[34px]', tooth: '5px', radius: 'rounded-t-[12px]' },
    lg: { pad: 'px-6 pt-6 pb-8', gap: 'gap-3', text: 'text-[12px]', brand: 'text-[18px]', mark: 18, big: 'text-[44px]', tooth: '6px', radius: 'rounded-t-[12px]' },
  }[size]

  const row = (k: string, v: React.ReactNode, strong = false) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={`text-right ${strong ? 'font-medium' : ''}`}>{v}</span>
    </div>
  )
  const dashed = <div className="border-t border-dashed border-border" />

  return (
    <div className={`relative ${animate ? 'motion animate-feed' : ''} ${className}`} style={animate ? { filter: 'drop-shadow(0 18px 24px rgba(14,9,28,.14))' } : undefined}>
      <div
        className={`receipt-edge bg-white text-ink border border-b-0 border-hairline ${s.radius} ${s.pad} font-mono ${s.text} tabular flex flex-col ${s.gap}`}
        style={{ ['--tooth' as string]: s.tooth }}
      >
        <div className="flex justify-between items-baseline">
          <span className="inline-flex items-center gap-[6px]">
            <HenadMark size={s.mark} title="" />
            <span className={`font-display font-semibold tracking-[-.03em] ${s.brand}`}>Henad</span>
          </span>
          <span className="label text-purple">
            {r.sample ? 'Sample receipt' : `Settlement receipt${r.index ? ` · #${r.index}` : ''}`}
          </span>
        </div>
        <div className="flex justify-between text-muted">
          <span>
            {c.source} → {c.target} · Monad
          </span>
          <span>{compact ? utcTime(r.settledAt) : utcStamp(r.settledAt)}</span>
        </div>
        {dashed}
        {showSent && !compact && row('Sent', `${money(r.sourceAmount, r.sourceAsset.decimals, '$')} · ${r.sourceAsset.symbol}`)}
        {row('Reference rate', compact ? rateLine(r.referenceRate, c.targetSymbol, c.rateDp).replace('1 USD = ', '') : rateLine(r.referenceRate, c.targetSymbol, c.rateDp))}
        {row('Executed rate', compact ? rateLine(r.executedRate, c.targetSymbol, c.rateDp).replace('1 USD = ', '') : rateLine(r.executedRate, c.targetSymbol, c.rateDp))}
        {row('Spread', spreadLine(r.spreadCost, r.targetAsset.decimals, c.targetSymbol, r.spreadBps, { signed: !compact, dp }), true)}
        {dashed}
        <div className="relative flex flex-col gap-1 py-[2px]">
          <div className="label text-muted">Delivered</div>
          <div className={`font-display font-medium tracking-[-.035em] leading-none ${s.big}`}>
            {money(r.deliveredAmount, r.targetAsset.decimals, c.targetSymbol, dp)}
          </div>
          {!compact && <div className="text-muted">to {shortAddress(r.recipient)}</div>}
          <SettledStamp animate={animate} size={size} />
        </div>
        {showMeta && !compact && (
          <>
            {dashed}
            {row(
              'Rate source',
              <>
                {c.note}
                <br />
                {shortAddress(r.rateSource)}
              </>,
            )}
            {row('Venue', c.venue?.label ?? '—')}
            {row('Intent', shortHash(r.intentId))}
            {row('Block', `${blockNumber(r.settledAtBlock)} · final in 0.6 s`)}
            {maxSpreadBps !== undefined && row('Max spread', `${maxSpreadBps} bps · not exceeded`)}
          </>
        )}
      </div>
    </div>
  )
}

export function SettledStamp({ animate = false, size = 'md' }: { animate?: boolean; size?: Size }) {
  const cls = size === 'sm' ? 'px-[7px] py-[3px] text-[9px]' : size === 'md' ? 'px-[10px] py-[5px] text-[10px]' : 'px-[10px] py-[5px] text-[11px]'
  return (
    <div
      className={`absolute right-0 top-[2px] rounded-[4px] border-2 border-purple text-purple font-mono uppercase tracking-[.16em] ${cls} ${animate ? 'motion animate-stamp' : ''}`}
      style={animate ? undefined : { transform: 'rotate(-4deg)' }}
    >
      Settled
    </div>
  )
}
