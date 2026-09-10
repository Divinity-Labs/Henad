import { HairlineColumns } from './HairlineColumns'
import { SectionHeader } from './SectionHeader'

const ITEMS = [
  {
    title: 'No fiat',
    body: 'Henad never takes pounds or dollars and never holds a float. On and off ramps are existing licensed providers, linked, not operated.',
  },
  {
    title: 'No custody',
    body: 'Funds move from your wallet to the recipient’s in one transaction. There is no balance to hold and no key Henad manages.',
  },
  {
    title: 'No KYC',
    body: 'Identity checks happen at the ramps that already do them. Henad only ever sees addresses and rates.',
  },
]

/** The regulatory position, stated as three absences. Desktop only, as the mobile canvas keeps one line of it in the CTA. */
export function NotDo() {
  return (
    <section className="hidden md:block" aria-labelledby="notdo-heading">
      <SectionHeader
        id="notdo-heading"
        eyebrow="What Henad does not do"
        title="Software between licensed ramps."
        body="A deliberate regulatory position, not a missing feature. Whoever touches fiat needs a licence. Henad never does, so the on and off ramps stay with providers already licensed where you and your recipient live."
      />
      <HairlineColumns items={ITEMS} />
    </section>
  )
}
