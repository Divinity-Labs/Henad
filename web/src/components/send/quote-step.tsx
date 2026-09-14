'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import type { Corridor, SourceAssetSymbol } from '@henad/core'
import { bps, money, rateLine, spreadLine } from '@/lib/format'
import {
  MAX_SPREAD_MAX,
  MAX_SPREAD_MIN,
  MAX_SPREAD_STEP,
  countdown,
  deliveredAtSpreadCap,
  quoteFreshness,
  quoteMaths,
  type QuoteDto,
} from '@henad/core'
import { Button } from '@/components/ui/Button'
import { firstName } from './amount-step'
import { Card, Notice, Rows, StepHeader, linkLabel, type Row } from './send-ui'

const SOURCE_DECIMALS = 6

/** The parts of a live corridor the quote screen needs, already known non-null. */
export interface LiveVenue {
  targetDecimals: number
  targetAddress: Address
  feedLabel: string
  feedRef: string
  venueLabel: string
}

function Headline({ cost, spread, decimals, symbol, dp }: { cost: bigint; spread: number; decimals: number; symbol: string; dp: number }) {
  if (cost > 0n)
    return (
      <>
        You are paying <span className="text-purple">{money(cost, decimals, symbol, dp)}</span> in spread. That is {spread} bps.
      </>
    )
  if (cost === 0n) return <>You are paying no spread on this quote.</>
  return (
    <>
      Your rate beats the reference by <span className="text-purple">{money(-cost, decimals, symbol, dp)}</span>. That is {-spread} bps.
    </>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex h-11 w-11 items-center justify-center rounded-[4px] border border-border bg-surface font-mono text-[18px] text-ink active:bg-surface-2 disabled:text-dim-2"
    >
      {children}
    </button>
  )
}

/** S2. The quote with its expiry, the spread headline, the rate table, the dark "receives" panel, the worst-rate stepper. */
export function QuoteStep({
  quote,
  corridor,
  venue,
  sourceAsset,
  recipientName,
  maxSpreadBps,
  now,
  busy,
  error,
  deployed,
  onSpread,
  onSend,
  onRequote,
  onBack,
}: {
  quote: QuoteDto
  corridor: Corridor
  venue: LiveVenue
  sourceAsset: SourceAssetSymbol
  recipientName: string
  maxSpreadBps: number
  now: number
  busy: boolean
  error: string | null
  /** false when HENAD has no contracts on this chain: the button stays disabled, nothing is faked */
  deployed: boolean
  onSpread: (delta: number) => void
  onSend: () => void
  onRequote: () => void
  onBack: () => void
}) {
  const c = corridor
  const m = quoteMaths(quote, SOURCE_DECIMALS, venue.targetDecimals)
  const fresh = quoteFreshness(quote.expiresAt, now)
  const dp = c.currencyDp
  const symbol = c.targetSymbol
  const floor = deliveredAtSpreadCap(m.referenceRate, maxSpreadBps, m.sourceAmount, SOURCE_DECIMALS, venue.targetDecimals)

  const pill =
    fresh === 'expired' ? (
      <span className="rounded-[4px] bg-ink px-2 py-[5px] text-white">Quote expired</span>
    ) : (
      <span role="timer" className={`rounded-[4px] px-2 py-[5px] text-ink tabular ${fresh === 'expiring' ? 'bg-amber' : 'border border-border bg-surface'}`}>
        Expires {countdown(quote.expiresAt, now)}
      </span>
    )

  const rows: Row[] = [
    { k: 'Reference rate', v: rateLine(m.referenceRate, symbol, c.rateDp) },
    { k: 'Your rate', v: rateLine(m.executedRate, symbol, c.rateDp) },
    { k: 'Spread', v: spreadLine(m.spreadCost, venue.targetDecimals, symbol, m.spreadBps, { dp }), strong: true },
    {
      k: 'Rate source',
      v: (
        <a href={`https://monadscan.com/address/${venue.feedRef}`} target="_blank" rel="noreferrer" className="text-ink">
          {venue.feedLabel} ↗
        </a>
      ),
    },
    { k: 'Venue', v: venue.venueLabel },
    {
      k: 'Network fee',
      v: (
        <span className="inline-flex items-center gap-[6px]">
          <Image src="/brand/mon-token.svg" alt="MON" width={14} height={14} className="rounded-[3px]" />
          sponsored
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-2 px-4 py-[14px]">
      <StepHeader
        left={
          <>
            Quote · <span className="text-muted">Step 2 of 2</span>
          </>
        }
        right={pill}
      />
      <p className="m-0 pt-[2px] font-display text-[24px] font-medium leading-[1.1] tracking-[-.03em] pretty">
        <Headline cost={m.spreadCost} spread={m.spreadBps} decimals={venue.targetDecimals} symbol={symbol} dp={dp} />
      </p>

      <Rows rows={rows} />

      <div className="flex flex-col gap-1 rounded-[12px] bg-dark px-[14px] py-3 text-white">
        <div className="label text-lilac-2">{firstName(recipientName)} receives</div>
        <div className="font-display text-[32px] font-medium leading-none tracking-[-.035em] tabular">{money(m.delivered, venue.targetDecimals, symbol, dp)}</div>
        <div className="font-mono text-[11px] text-dim">
          for {money(m.sourceAmount, SOURCE_DECIMALS, '$')} {sourceAsset} · final in 0.6 s
        </div>
      </div>

      <Card className="flex flex-col gap-[6px] px-[14px] py-[10px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-[3px]">
            <div className="label text-muted">Worst rate you&apos;ll accept</div>
            <div className="font-mono text-[13px] font-medium tabular">
              {money(floor, venue.targetDecimals, symbol, dp)} · {bps(maxSpreadBps)}
            </div>
          </div>
          <div className="flex gap-[6px]">
            <StepButton label={`Accept ${MAX_SPREAD_STEP} bps less spread`} disabled={maxSpreadBps <= MAX_SPREAD_MIN} onClick={() => onSpread(-MAX_SPREAD_STEP)}>
              −
            </StepButton>
            <StepButton label={`Accept ${MAX_SPREAD_STEP} bps more spread`} disabled={maxSpreadBps >= MAX_SPREAD_MAX} onClick={() => onSpread(MAX_SPREAD_STEP)}>
              +
            </StepButton>
          </div>
        </div>
        <p className="m-0 text-[12px] leading-[1.5] text-grey">If the fill is worse than this, the payout reverts. Nothing moves.</p>
      </Card>

      <div className="flex-1" />
      {error && <Notice>{error}</Notice>}
      {fresh === 'expired' ? (
        <Button variant="secondary" size="xl" block onClick={onRequote}>
          Get a new quote
        </Button>
      ) : (
        <Button variant={deployed && !busy ? 'primary' : 'disabled'} size="xl" block onClick={onSend}>
          {busy ? 'Sending…' : 'Send payout'}
        </Button>
      )}
      {!deployed && fresh !== 'expired' && (
        <p className="m-0 text-center font-mono text-[10px] tracking-[.06em] text-muted">Contracts not deployed on this chain yet</p>
      )}
      <button type="button" onClick={onBack} className={`press ${linkLabel} py-1 text-center text-muted`}>
        Back
      </button>
    </div>
  )
}
