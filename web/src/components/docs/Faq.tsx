import { JsonLd } from '@/components/JsonLd'

/**
 * Questions people have actually asked about Henad, answered first and explained second.
 *
 * Each answer opens with the answer, in a sentence that stands on its own, because that
 * is the sentence a search snippet or an AI answer lifts. The same text feeds the FAQPage
 * structured data, so the markup can never claim an answer the page does not show.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is Henad?',
    a: 'Henad is a cross-border payout app on Monad: you send dollars and the recipient receives pounds, euros, Swiss francs or yen, in one transaction. Every payout writes a public receipt onchain with the reference rate, the rate actually executed, and the spread between them in basis points.',
  },
  {
    q: 'Is Henad an off-ramp?',
    a: 'No. Henad does the currency conversion, not the cash-out. The recipient ends up holding a currency-pegged token on Monad, such as GBPm, and turning it into money in a bank account is done through whatever licensed exchange operates where they live. Henad never touches fiat, never holds funds, and does no KYC.',
  },
  {
    q: 'What does the "m" in GBPm mean?',
    a: 'The m stands for Mento, not Monad. Mento issues the USDm, GBPm, EURm, CHFm and JPYm stablecoins and runs the onchain pools between them, which is what lets Henad convert dollars into pounds on Monad at all.',
  },
  {
    q: 'How is the spread calculated?',
    a: 'The spread is the shortfall of the rate you received against the reference rate, in basis points: (reference − executed) ÷ reference × 10,000, truncated so it is never overstated. The reference comes from a Chainlink feed read in the same transaction as the swap, and the executed rate is computed from the amounts that actually moved. A negative spread means you beat the reference.',
  },
  {
    q: 'Does Henad charge a fee?',
    a: 'No. The contracts take no fee and have no fee setting to switch on later. What a payout costs is the spread taken by the market, and that is exactly the number the receipt publishes.',
  },
  {
    q: 'Who pays the gas?',
    a: 'Henad does. You sign one authorisation with your passkey and Henad’s relayer submits it and pays the Monad gas, so you never need MON to send a payout. MON is only needed if you choose to swap it for AUSD or USDC on the Top up page.',
  },
  {
    q: 'Which currencies can I send to?',
    a: 'From AUSD: British pounds, euros, Swiss francs and Japanese yen. From USDC: British pounds. Canadian dollars have a reference rate on Monad but no token to deliver, and naira and rand have no usable rate on Monad at all, so Henad shows them without pretending they settle.',
  },
  {
    q: 'Why can I not send at the weekend?',
    a: 'Because the FX market is closed. Mento’s pools stop quoting from 21:00 UTC on Friday until 23:00 UTC on Sunday, following the real foreign-exchange market, and a payout settled against a stale rate would make the receipt meaningless.',
  },
  {
    q: 'Can I check a payout I did not send?',
    a: 'Yes. Every receipt has a permanent public page at usehenad.xyz/receipt/ followed by its id, and the same figures are stored in the RateAttestation contract on Monad. Anyone can recompute the executed rate from the amounts and replay the reference read from the Chainlink round ids the receipt records.',
  },
  {
    q: 'What happens if I lose my phone?',
    a: 'Your account is your passkey, not your phone. On a new device, sign in with the same passkey, synced through Google Password Manager or iCloud Keychain, and the same address comes back. Nobody, including Henad, can recover an account whose passkey is lost.',
  },
]

const schema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}

export function Faq() {
  return (
    <section aria-labelledby="faq" className="mt-8 flex flex-col gap-6 border-t border-hairline pt-8">
      <h2 id="faq" className="m-0 font-display text-[22px] font-medium tracking-[-.02em]">
        Questions
      </h2>
      {FAQ.map(({ q, a }) => (
        <div key={q} className="flex flex-col gap-2">
          <h3 className="m-0 text-[16px] font-medium text-ink">{q}</h3>
          <p className="pretty m-0 max-w-[560px] text-[15px] leading-[1.6] text-grey">{a}</p>
        </div>
      ))}
      <JsonLd data={schema} />
    </section>
  )
}
