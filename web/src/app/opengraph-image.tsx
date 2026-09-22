import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

// The site's share card, used by every page that has no card of its own. Receipts render
// their own from the chain; this one is static, so it is built once and cached.
export const alt = 'Henad — send dollars, they arrive as pounds, with a public receipt of the rate and the spread'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
    <span style={{ fontSize: strong ? 17 : 16 }}>{v}</span>
  </div>
)
const dashed = <div style={{ display: 'flex', height: 0, borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: DASH }} />

/**
 * The figures on the right are receipt #1, the first settlement on mainnet, block
 * 105,952,304 — not an illustration. A card that says "check the number" should carry a
 * number that can be checked.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: '56px 64px',
          color: '#FFFFFF',
          backgroundColor: '#17171B',
          backgroundImage: 'radial-gradient(ellipse 90% 80% at 20% 110%, #4B37C9 0%, #23185E 45%, #17171B 100%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 600 }}>
          <div style={{ display: 'flex', fontSize: 40, letterSpacing: '-0.03em', lineHeight: 1 }}>Henad</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontSize: 58, lineHeight: 1.05, letterSpacing: '-0.035em' }}>Send dollars. They arrive as pounds.</div>
            <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.35, color: LILAC }}>
              Every payout leaves a public receipt: the reference rate, the rate you got, and the spread in basis points.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, letterSpacing: '0.08em', color: LILAC }}>
            <span>usehenad.xyz</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {monadMark && <img src={monadMark} alt="" height={16} width={85} style={{ opacity: 0.7 }} />}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            width: 400,
            marginLeft: 'auto',
            marginTop: 'auto',
            marginBottom: 'auto',
            padding: '28px 28px 32px',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            color: INK,
            fontSize: 16,
            boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 22, letterSpacing: '-0.03em' }}>Henad</span>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: PURPLE }}>Receipt #1</span>
          </div>
          <div style={{ display: 'flex', color: MUTED, fontSize: 13 }}>AUSD → GBPm · Monad mainnet</div>
          {dashed}
          {row('Sent', '$0.40 · AUSD')}
          {row('Reference rate', '1 USD = £0.74666')}
          {row('Executed rate', '1 USD = £0.74517')}
          {row('Spread', '+19 bps', true)}
          {dashed}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>Delivered</span>
            <span style={{ fontSize: 52, lineHeight: 1, letterSpacing: '-0.035em' }}>0.30 GBPm</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
