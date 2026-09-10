import { CorridorList, CorridorTable } from '@/components/CorridorRows'
import type { LiveRate } from '@/lib/rates'
import { SectionHeader } from './SectionHeader'

/** The registry, three tiers, every number from its feed. Table at md and up, list below. */
export function Corridors({ rates }: { rates: LiveRate[] }) {
  return (
    <section aria-labelledby="corridors-heading">
      <SectionHeader
        id="corridors-heading"
        eyebrow="Corridors"
        title="Three kinds of corridor. Every number from a live feed."
        body="A corridor is live when it has a rate source and a venue. It is quotable when it has a rate source and no asset to deliver into. It is unpriced when Monad has no feed for it at all. Henad’s registry holds all three, so the gaps are visible in the product."
      />
      <div className="hidden md:block border-b border-hairline">
        <CorridorTable rates={rates} />
      </div>
      <div className="md:hidden">
        <CorridorList rates={rates} />
      </div>
    </section>
  )
}
