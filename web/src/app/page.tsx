import { EXPLORERS } from '@henad/core'
import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { Button } from '@/components/ui/Button'
import { AnnouncementBar } from '@/components/landing/AnnouncementBar'
import { Corridors } from '@/components/landing/Corridors'
import { Cta } from '@/components/landing/Cta'
import { DeliveredBand } from '@/components/landing/DeliveredBand'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingMobileMenu } from '@/components/landing/MobileMenu'
import { NotDo } from '@/components/landing/NotDo'
import { RailsGrid } from '@/components/landing/RailsGrid'
import { ReceiptCard, ReceiptPanel } from '@/components/landing/ReceiptPanel'
import { StatStrip } from '@/components/landing/StatStrip'
import { UnpricedCard, UnpricedModule } from '@/components/landing/UnpricedModule'
import { landingLedger } from '@/components/landing/ledger'
import { appChainId } from '@/lib/chain'
import { SAMPLE_RECEIPT } from '@/lib/fixtures'
import { money } from '@/lib/format'
import { liveRates } from '@/lib/rates'
import { deploymentAddresses, settledReceipts } from '@/lib/receipts'

/** Rate reads and the ledger are cached 30 s; the page follows them. */
// Read per request: the rate and the receipt are read from the chain, and a build
// artefact of either would be a number the chain no longer has. liveRates() coalesces
// concurrent reads for 12 s in process, which is the throttle this used to get from ISR.
export const dynamic = 'force-dynamic'

/**
 * Landing, artboards L1 (desktop) and L1m (mobile) as one responsive page.
 * Every figure comes from the chain or the live feeds. Before the first
 * settlement the fixture stands in for the slip only, labelled "Sample".
 */
export default async function Home() {
  const [receipts, rates] = await Promise.all([settledReceipts(), liveRates()])
  const ledger = landingLedger(receipts)
  const sample = ledger.latest === null
  const slip = ledger.latest ?? SAMPLE_RECEIPT
  const p = ledger.primary
  const delivered = p
    ? money(p.delivered, p.decimals, p.symbol, p.dp)
    : money(SAMPLE_RECEIPT.deliveredAmount, SAMPLE_RECEIPT.targetAsset.decimals, SAMPLE_RECEIPT.corridor.targetSymbol, SAMPLE_RECEIPT.corridor.currencyDp)
  const ghostBps = ledger.latest ? String(ledger.latest.spreadBps) : '—'
  const deployment = deploymentAddresses()
  const explorer = deployment ? `${EXPLORERS[appChainId()].url}/address/${deployment.rateAttestation}` : null

  return (
    <div className="dotgrid min-h-dvh">
      <AnnouncementBar latest={ledger.latest} network={ledger.network} />
      <div className="bg-canvas md:mx-10 md:max-w-[1200px] xl:mx-auto md:border-x md:border-hairline">
        <Nav
          mobileRight={
            <>
              <Button href="/send" size="sm">
                Send
              </Button>
              <LandingMobileMenu />
            </>
          }
        />
        <main>
          <Hero slip={slip} latest={ledger.latest} rates={rates} />
          <StatStrip ledger={ledger} />
          <RailsGrid />
          <HowItWorks />
          <ReceiptPanel slip={slip} ghost={ghostBps} />
          <DeliveredBand figure={delivered} settlements={ledger.settlements} sample={sample} explorer={explorer} />
          <Corridors rates={rates} />
          <UnpricedModule />
          <UnpricedCard />
          <ReceiptCard ghost={ghostBps} />
          <NotDo />
          <Cta latest={ledger.latest} />
        </main>
        <div className="hidden md:block">
          <Footer />
        </div>
      </div>
    </div>
  )
}
