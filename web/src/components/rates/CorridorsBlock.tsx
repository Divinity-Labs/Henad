import { CorridorList, CorridorTable } from '@/components/CorridorRows'
import type { LiveRate } from '@/lib/rates'

/** "Corridors" heading with the registry: the W2 table at md and up, the S4 list below. */
export function CorridorsBlock({ rates }: { rates: LiveRate[] }) {
  return (
    <section className="flex flex-col md:border-b md:border-hairline">
      <div className="flex items-baseline justify-between px-4 pt-5 pb-2 md:px-9 md:pt-6 md:pb-3">
        <h2 className="m-0 font-display text-[17px] font-medium tracking-[-.02em] md:text-[20px]">Corridors</h2>
        <span className="font-mono text-[9px] tracking-[.08em] uppercase text-muted md:text-[11px]">
          <span className="lg:hidden">Live feeds only</span>
          <span className="hidden lg:inline">Live feeds only · stale past heartbeat is shown as stale</span>
        </span>
      </div>
      <div className="scroll-x hidden lg:block">
        <CorridorTable rates={rates} />
      </div>
      <div className="lg:hidden">
        <CorridorList rates={rates} />
      </div>
    </section>
  )
}
