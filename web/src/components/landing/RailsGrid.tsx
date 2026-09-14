import { FINALITY_MS } from '@henad/core'
import { PartnerMark } from '@/components/ui/Brand'
import { CORRIDORS } from '@henad/core'

type Mark = Parameters<typeof PartnerMark>[0]['name']

interface Rail {
  name: string
  mark?: Mark
  height?: number
  label: string
}

const chainlinkTargets = CORRIDORS.filter((c) => c.feed?.kind === 'chainlink')
  .map((c) => c.target)
  .join(' ')
const mentoVenues = CORRIDORS.flatMap((c) => (c.venue && c.targetAsset ? [c.targetAsset.symbol] : [])).join(' ')
const pyth = CORRIDORS.find((c) => c.feed?.kind === 'pyth')

const RAILS: Rail[] = [
  { name: 'Monad', mark: 'monad-full-black', height: 18, label: `Settlement · ${FINALITY_MS / 1000} s finality` },
  { name: 'Mento', mark: 'mento', height: 18, label: `${mentoVenues} venues` },
  { name: 'Chainlink', mark: 'chainlink', height: 20, label: `${chainlinkTargets} feeds · reference rate` },
  { name: 'Agora', mark: 'agora', height: 18, label: 'AUSD source asset' },
  { name: 'Mera', label: 'Passkey accounts · no seed phrase' },
  { name: 'Aurora Intents', label: 'Inbound funds from other chains' },
  { name: 'Envio', label: 'Receipt indexing · planned' },
  { name: 'Nansen', mark: 'nansen', height: 20, label: 'Wallet labels · planned' },
  { name: 'Pyth', label: `${pyth ? `${pyth.source}/${pyth.target} ` : ''}pull feed · evaluated` },
]

/** Every rail the product reads or links, in a five-column hairline grid. Desktop only, as the mobile canvas drops it. */
export function RailsGrid() {
  return (
    <section className="hidden md:flex flex-col" aria-labelledby="rails-heading">
      <h2 id="rails-heading" className="m-0 px-9 py-5 text-[15px] font-normal text-grey border-b border-hairline">
        Rails Henad reads or links. It operates none of them.
      </h2>
      <ul className="m-0 p-0 list-none grid grid-cols-5">
        {RAILS.map((r, i) => (
          <li key={r.name} className={`flex flex-col justify-center gap-2 h-24 px-9 border-b border-hairline ${(i + 1) % 5 === 0 ? '' : 'border-r'}`}>
            {r.mark ? (
              <PartnerMark name={r.mark} height={r.height} />
            ) : (
              <span className="font-display font-semibold text-[18px] tracking-[-.02em] text-grey-2">{r.name}</span>
            )}
            <span className="label text-muted">{r.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
