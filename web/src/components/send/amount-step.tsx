'use client'

import Link from 'next/link'
import { isAddress, parseUnits } from 'viem'
import { deliveredAt } from '@henad/core'
import { CORRIDORS, SOURCE_ASSETS, type Corridor, type SourceAssetSymbol } from '@henad/core'
import { money, rateLine, shortAddress, tokens } from '@/lib/format'
import type { RateDto } from '@/lib/send-serial'
import { Button } from '@/components/ui/Button'
import { TierPill } from '@/components/ui/TierPill'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { AssetSelect } from './asset-select'
import { Card, Notice, StepHeader, linkLabel } from './send-ui'

const SOURCE_DECIMALS = 6

/** Base units of the amount field, or null when it is not a positive dollar amount. */
export function amountUnits(amount: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return null
  const units = parseUnits(amount, SOURCE_DECIMALS)
  return units > 0n ? units : null
}

/** "AO" from "Ada Okonkwo"; the first two hex characters of the address when there is no name. */
export function initials(name: string, address: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('')
  return address.slice(2, 4).toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Recipient'
}

function refusal(c: Corridor): string {
  return c.tier === 'quote'
    ? `Priced on Monad, but there is no ${c.targetName} asset to deliver into.`
    : `Henad cannot price ${c.targetName} on Monad yet.`
}

export interface AmountStepProps {
  corridor: Corridor
  rate: RateDto | undefined
  now: number
  sourceAsset: SourceAssetSymbol
  amount: string
  balance: bigint | null
  recipient: string
  recipientName: string
  editingRecipient: boolean
  busy: boolean
  error: string | null
  onAmount: (value: string) => void
  onAsset: (value: SourceAssetSymbol) => void
  onCorridor: (key: string) => void
  onRecipient: (value: string) => void
  onRecipientName: (value: string) => void
  onEditRecipient: (editing: boolean) => void
  onPaste: () => void
  onQuote: () => void
}

/** S1. Amount, source asset, the indicative "receives" at the reference rate, the recipient, "Get quote". */
export function AmountStep(p: AmountStepProps) {
  const c = p.corridor
  const targetAsset = c.targetAsset
  const units = amountUnits(p.amount)
  const rate = p.rate?.rate ? BigInt(p.rate.rate) : null
  const live = c.tier === 'live' && targetAsset !== null
  const receives =
    units !== null && rate !== null && targetAsset
      ? tokens(deliveredAt(rate, units, SOURCE_DECIMALS, targetAsset.decimals), targetAsset.decimals, targetAsset.symbol, c.currencyDp)
      : '—'
  const validRecipient = isAddress(p.recipient)
  const overBalance = units !== null && p.balance !== null && units > p.balance
  const age = p.rate?.updatedAt ? Math.max(0, Math.floor(p.now / 1000 - p.rate.updatedAt)) : null
  const blocker = !live
    ? `USD → ${c.target} cannot settle on Monad.`
    : units === null
      ? 'Enter an amount.'
      : overBalance
        ? `That is more than your ${p.sourceAsset} balance.`
        : !validRecipient
          ? 'Add a recipient address.'
          : rate === null
            ? 'No reference rate right now.'
            : null
  const canQuote = blocker === null && !p.busy
  const pricedOnly = CORRIDORS.filter((x) => x.tier === 'quote')
    .map((x) => x.target)
    .join(' ')

  return (
    <div className="flex flex-1 flex-col gap-[10px] px-4 pb-4 pt-5">
      <StepHeader left="Send" right="Step 1 of 2" />

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You send</span>
          <span className="tabular">Balance {p.balance === null ? '—' : money(p.balance, SOURCE_DECIMALS, '')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 items-baseline font-display text-[38px] font-medium leading-none tracking-[-.035em]">
            <span className="sr-only">Amount to send, in US dollars</span>
            <span aria-hidden>$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0.00"
              value={p.amount}
              onChange={(e) => p.onAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent p-0 tabular placeholder:text-dim-2"
              style={{ font: 'inherit' }}
            />
          </label>
          <AssetSelect
            label="Source asset"
            value={p.sourceAsset}
            onChange={(v) => p.onAsset(v as SourceAssetSymbol)}
            options={SOURCE_ASSETS.map((a) => ({
              value: a.symbol,
              label: a.label,
              icon: <TokenIcon symbol={a.symbol} size={22} />,
              detail: a.symbol === 'AUSD' ? 'Agora dollar · Monad' : 'Circle USD Coin · Monad',
            }))}
          />
        </div>
        {/* Where you notice the balance is short, so the way out of that belongs here. */}
        <Link href="/top-up" className={`${linkLabel} flex items-center justify-between border-t border-hairline-2 pt-[10px] text-purple`}>
          <span>Top up with MON</span>
          <span className="text-muted">Swap on PancakeSwap →</span>
        </Link>
      </Card>

      <div className="flex items-center justify-between whitespace-nowrap px-4 font-mono text-[11px] text-muted tabular">
        {rate !== null ? (
          <>
            <span className="text-ink">{rateLine(rate, c.targetSymbol, c.rateDp)}</span>
            <span>
              {c.feed?.kind === 'pyth' ? 'Pyth' : 'Chainlink'} · {age ?? '—'} s{p.rate?.stale ? <span className="text-amber"> · stale</span> : null}
            </span>
          </>
        ) : (
          <span>{c.feed ? `${c.feed.label} · no answer` : 'No rate on Monad'}</span>
        )}
      </div>

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label text-muted">{firstName(p.recipientName)} receives</div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">{receives}</div>
          <AssetSelect
            label="Currency the recipient receives"
            value={c.key}
            onChange={p.onCorridor}
            options={CORRIDORS.map((x) => ({
              value: x.key,
              label: x.target,
              icon: <TokenIcon symbol={x.targetAsset?.symbol ?? x.target} size={22} />,
              // Name the token that arrives, or say plainly why nothing can.
              detail: x.targetAsset ? `${x.targetName} · ${x.targetAsset.symbol}` : x.tier === 'quote' ? `${x.targetName} · priced, no token` : `${x.targetName} · no rate on Monad`,
              badge: <TierPill tier={x.tier} size="sm" />,
            }))}
          />
        </div>
        {live ? (
          <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">At the reference rate. The exact amount after spread comes before you sign.</p>
        ) : (
          <>
            <p className="m-0 font-mono text-[11px] text-ink">{c.note}</p>
            <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">{refusal(c)}</p>
          </>
        )}
        <Link
          href={c.tier === 'unpriced' ? '/docs/mrc' : '/rates'}
          className={`${linkLabel} flex items-center justify-between border-t border-hairline-2 pt-[10px] text-muted`}
        >
          <span>{c.tier === 'unpriced' ? 'Read the MRC' : `${pricedOnly} · priced only`}</span>
          <span className="text-purple">Why →</span>
        </Link>
      </Card>

      {validRecipient && !p.editingRecipient ? (
        <Card className="flex items-center gap-3 px-4 py-3">
          <div aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[8px] bg-lilac font-display text-[13px] font-semibold text-purple-deep">
            {initials(p.recipientName, p.recipient)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <div className="truncate text-[15px] font-medium">{p.recipientName.trim() || shortAddress(p.recipient)}</div>
            <div className="font-mono text-[11px] text-muted">{shortAddress(p.recipient)} · Monad</div>
          </div>
          <button type="button" onClick={() => p.onEditRecipient(true)} className={`press ${linkLabel} text-ink`}>
            Change
          </button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-[10px] p-4">
          <div className="label flex justify-between text-muted">
            <span>Recipient</span>
            <button type="button" onClick={p.onPaste} className="press label text-purple">
              Paste
            </button>
          </div>
          <label className="flex flex-col gap-1">
            <span className="sr-only">Recipient address on Monad</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x… address on Monad"
              value={p.recipient}
              onChange={(e) => p.onRecipient(e.target.value)}
              className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] font-mono text-[12px] text-ink placeholder:text-muted"
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="label text-muted">Name · stays on this device</span>
            <input
              type="text"
              autoComplete="off"
              placeholder="Display name"
              value={p.recipientName}
              onChange={(e) => p.onRecipientName(e.target.value)}
              className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] text-[15px] text-ink placeholder:text-muted"
            />
          </label>
          {p.recipient && !validRecipient && <Notice>That is not a Monad address. It starts with 0x and is 42 characters long.</Notice>}
          <Button variant={validRecipient ? 'secondary' : 'disabled'} size="md" onClick={() => p.onEditRecipient(false)}>
            Done
          </Button>
        </Card>
      )}

      <div className="flex-1" />
      {p.error && <Notice>{p.error}</Notice>}
      <Button variant={canQuote ? 'primary' : 'disabled'} size="xl" block onClick={p.onQuote}>
        {p.busy ? 'Getting quote…' : 'Get quote'}
      </Button>
      <p className="m-0 text-center font-mono text-[10px] tracking-[.06em] text-muted">{blocker ?? 'Nothing moves until you approve the rate.'}</p>
    </div>
  )
}
