import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Nav } from '@/components/Nav'
import { Button } from '@/components/ui/Button'
import { ClosedBanner } from '@/components/rates/ClosedBanner'
import { CorridorsBlock } from '@/components/rates/CorridorsBlock'
import { DemoClosed } from '@/components/rates/DemoClosed'
import { FooterStrip } from '@/components/rates/FooterStrip'
import { RatesFrame } from '@/components/rates/RatesFrame'
import { RatesHero } from '@/components/rates/RatesHero'
import { RoutesBlock } from '@/components/rates/RoutesBlock'
import { SettlementsBlock } from '@/components/rates/SettlementsLedger'
import { chainLabel, explorerHref, headline, settled } from '@/components/rates/ledger'
import { CORRIDORS } from '@/lib/corridors'
import { liveRates } from '@/lib/rates'
import { listReceipts, totals } from '@/lib/receipts'

export const metadata: Metadata = { title: 'Rates' }
export const revalidate = 30

/** Rows the Settlements block lists; the hero and Routes are totalled over the whole ledger. */
const LEDGER_ROWS = 50

/** /rates — artboards W2 (md and up) and S4 (below md) as one page. */
export default async function RatesPage() {
  const [rates, receipts] = await Promise.all([liveRates(), listReceipts(Infinity)])
  const t = totals(receipts)
  const sample = receipts.some((r) => r.sample)
  const live = rates.find((r) => r.corridor.tier === 'live')
  const lastSettled = live ? (settled(receipts).reverse().find((r) => r.corridor.key === live.corridor.key) ?? null) : null
  const banner = live ? <ClosedBanner corridor={live.corridor} lastSettled={lastSettled} /> : null
  return (
    <RatesFrame
      banner={
        live?.marketClosed ? (
          banner
        ) : (
          <Suspense fallback={null}>
            <DemoClosed>{banner}</DemoClosed>
          </Suspense>
        )
      }
    >
      <Nav
        showBuiltOn={false}
        right={
          <Button href="/send" variant="secondary" size="md">
            Sign in
          </Button>
        }
      />
      <main className="flex flex-1 flex-col">
        <RatesHero count={t.settlements} head={headline(t)} sample={sample} chain={chainLabel()} />
        <CorridorsBlock rates={rates} />
        <div className="hidden md:block lg:grid lg:grid-cols-[minmax(320px,400px)_1fr]">
          <RoutesBlock corridors={CORRIDORS} totals={t} sample={sample} />
          <SettlementsBlock receipts={receipts.slice(-LEDGER_ROWS)} />
        </div>
        <div className="flex-1" />
      </main>
      <FooterStrip explorer={explorerHref()} />
    </RatesFrame>
  )
}
