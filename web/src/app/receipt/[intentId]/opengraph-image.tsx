import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { money, rateLine, shortAddress, shortHash, utcStamp } from '@/lib/format'
import { isIntentId, loadReceipt, requestOrigin } from '@/lib/receipt-page'

export const revalidate = 60
export const alt = 'Henad settlement receipt'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Brand mark, read once at module scope. The card itself needs no assets.
const monadMark = await readFile(join(process.cwd(), 'public/brand/monad-full-white.svg'), 'base64')
  .then((b64) => `data:image/svg+xml;base64,${b64}`)
  .catch(() => null)

const INK = '#0E091C'
const MUTED = '#8A8A96'
const PURPLE = '#6E54FF'
const LILAC = '#B9AEFF'
const DASH = '#D9D9DE'

const row = (k: string, v: string, strong = false) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
    <span style={{ color: MUTED }}>{k}</span>
    <span style={{ fontSize: strong ? 16 : 15 }}>{v}</span>
  </div>
)
const dashed = <div style={{ display: 'flex', height: 0, borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: DASH }} />

/** 1200×630 share card. Default bundled font only: nothing is fetched at render time. */
export default async function Image({ params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params
  if (!isIntentId(intentId)) notFound()
  const r = await loadReceipt(intentId)
  if (!r) notFound()
  const { host } = await requestOrigin()

  const c = r.corridor
  const dp = c.currencyDp
  const delivered = money(r.deliveredAmount, r.targetAsset.decimals, c.targetSymbol, dp)
  const paid = money(r.sourceAmount, r.sourceAsset.decimals, '$')
  const cost = money(r.spreadCost < 0n ? -r.spreadCost : r.spreadCost, r.targetAsset.decimals, c.targetSymbol, dp)
  const bps = r.spreadBps > 0 ? `+${r.spreadBps}` : String(r.spreadBps)
  const spread = `${r.spreadCost < 0n ? '−' : ''}${cost} · ${bps} bps`
  const ghost = r.spreadBps < 0 ? `−${-r.spreadBps}` : String(r.spreadBps)
  const kind = r.sample ? 'Sample receipt' : `Settlement receipt${r.index ? ` · #${r.index}` : ''}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          padding: '56px 64px',
          color: '#FFFFFF',
          backgroundColor: '#17171B',
          backgroundImage: 'radial-gradient(ellipse 90% 80% at 20% 110%, #4B37C9 0%, #23185E 45%, #17171B 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -10,
            bottom: -90,
            display: 'flex',
            fontSize: 460,
            lineHeight: 1,
            letterSpacing: '-0.06em',
            color: 'rgba(255,255,255,0.06)',
          }}
        >
          {ghost}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontSize: 40, letterSpacing: '-0.03em', lineHeight: 1 }}>Henad</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, letterSpacing: '0.12em', textTransform: 'uppercase', color: LILAC }}>
              <span>{`${kind} · ${c.source} → ${c.target} · Monad`}</span>
              {r.sample && (
                <span style={{ display: 'flex', padding: '4px 10px', borderRadius: 4, backgroundColor: '#FFAE45', color: INK, fontSize: 13 }}>Sample</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', fontSize: 46, lineHeight: 1.1, letterSpacing: '-0.03em' }}>{`${delivered} delivered for ${paid}.`}</div>
            <div style={{ display: 'flex', fontSize: 22, lineHeight: 1.3, color: LILAC }}>{`Spread ${spread}${c.feed ? ` · ${c.feed.label} reference` : ''}`}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, letterSpacing: '0.08em', color: LILAC }}>
            <span>{`${host || ''}/receipt/${shortHash(r.intentId)}`}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {monadMark && <img src={monadMark} alt="" height={16} width={85} style={{ opacity: 0.7 }} />}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: 440,
            marginLeft: 'auto',
            padding: '28px 28px 32px',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            color: INK,
            fontSize: 15,
            boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 22, letterSpacing: '-0.03em' }}>Henad</span>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: PURPLE }}>{kind}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED, fontSize: 13 }}>
            <span>{`${c.source} → ${c.target} · Monad`}</span>
            <span>{utcStamp(r.settledAt)}</span>
          </div>
          {dashed}
          {row('Sent', `${paid} · ${r.sourceAsset.symbol}`)}
          {row('Reference rate', rateLine(r.referenceRate, c.targetSymbol, c.rateDp))}
          {row('Executed rate', rateLine(r.executedRate, c.targetSymbol, c.rateDp))}
          {row('Spread', spread, true)}
          {dashed}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', padding: '4px 0' }}>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>Delivered</span>
            <span style={{ fontSize: 60, lineHeight: 1, letterSpacing: '-0.035em' }}>{delivered}</span>
            <span style={{ color: MUTED }}>{`to ${shortAddress(r.recipient)}`}</span>
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 4,
                display: 'flex',
                padding: '6px 12px',
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: PURPLE,
                borderRadius: 4,
                color: PURPLE,
                fontSize: 13,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                transform: 'rotate(-4deg)',
              }}
            >
              Settled
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
