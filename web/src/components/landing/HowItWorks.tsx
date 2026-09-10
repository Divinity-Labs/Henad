import { HairlineColumns } from './HairlineColumns'
import { SectionHeader } from './SectionHeader'

const STEPS = [
  {
    title: 'You see the spread in pounds first',
    body: 'The reference rate comes from Chainlink’s GBP/USD and AUSD/USD feeds, composed on-chain. Henad shows your rate next to it and the difference as an amount, then in basis points.',
  },
  {
    title: 'The contract enforces your worst rate',
    body: 'You set a maximum spread. If the fill is worse, CorridorRouter reverts in the same transaction and nothing moves.',
  },
  {
    title: 'Every payout emits a public receipt',
    body: 'RateAttestation writes reference rate, executed rate, spread, and the rate source to Monad. Anyone can open the permalink and check it against the chain, without a wallet.',
  },
]

/** Quote. Settle. Receipt. Desktop only, as the mobile canvas drops it. */
export function HowItWorks() {
  return (
    <section className="hidden md:block" aria-labelledby="how-heading">
      <SectionHeader
        id="how-heading"
        eyebrow="How it works"
        title="Quote. Settle. Receipt."
        body="Remittance pricing hides its real cost inside the exchange rate. On Monad the quote and the fill are both public, so the spread can be shown before you sign, capped by the contract, and proven afterwards."
      />
      <HairlineColumns items={STEPS} numbered />
    </section>
  )
}
