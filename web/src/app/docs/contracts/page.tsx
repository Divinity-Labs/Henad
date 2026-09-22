import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { HENAD, MONAD_MAINNET_ID } from '@henad/core'
import { monadscanAddress } from '@/lib/receipt-page'

export const metadata: Metadata = pageMeta({
  title: 'Contracts',
  description: 'The Henad contracts on Monad mainnet, their addresses, and exactly what the owner key can do.',
  path: '/docs/contracts',
})

const REPO = 'https://github.com/Divinity-Labs/Henad'

const DEPLOYED = HENAD[MONAD_MAINNET_ID]

const ADDRESSES = [
  {
    name: 'CorridorRouter',
    address: DEPLOYED?.corridorRouter,
    what: 'Reads the reference rate, swaps through the venue, checks the spread against the cap you signed, and writes the receipt. Reverts if the fill is worse.',
  },
  {
    name: 'RateAttestation',
    address: DEPLOYED?.rateAttestation,
    what: 'The receipt store. Append-only: the router is its only writer, and nothing can change a record once written.',
  },
  {
    name: 'ChainlinkRateSource',
    address: '0x0b7CB973f3ceBbdd8983973727dcB381dD184228',
    what: 'Names the Chainlink feed pair behind each corridor, and refuses a rate older than its heartbeat allows.',
  },
  {
    name: 'MentoVenueAdapter',
    address: '0xdf80efdAb089F33157845B653A44388640838360',
    what: 'Executes the swap through Mento, and reports when the FX market is closed rather than pricing anyway.',
  },
] as const

/** /docs/contracts — the addresses, verified, with the owner's powers stated exhaustively. */
export default function ContractsPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · Contracts</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">
        Four contracts on Monad mainnet, verified, with no upgrade path.
      </h1>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Deployed on 18 September 2026 at block 105,928,848 and verified on Monadscan, so the source you read there is the code that
        runs. There is no proxy: these addresses can never point at different logic.
      </p>

      <div className="mt-2 flex flex-col gap-4">
        {ADDRESSES.map((c) => (
          <div key={c.name} className="flex flex-col gap-[6px] border-t border-hairline pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-[18px] font-medium tracking-[-.02em]">{c.name}</span>
              {c.address && (
                <a href={monadscanAddress(c.address)} target="_blank" rel="noreferrer" className="label-md text-purple">
                  Monadscan ↗
                </a>
              )}
            </div>
            <p className="m-0 font-mono text-[12px] break-all text-ink select-all">{c.address ?? 'not deployed'}</p>
            <p className="pretty m-0 max-w-[560px] text-[15px] leading-[1.6] text-grey">{c.what}</p>
          </div>
        ))}
      </div>

      <h2 className="m-0 mt-6 font-display text-[20px] font-medium tracking-[-.02em]">What the owner key can do</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Exhaustively: register a corridor for a token pair, and repoint an existing corridor&apos;s rate source or venue, which exists
        so a redeployed Mento pool or a retired Chainlink feed cannot strand a currency forever. Every repoint is logged on chain with
        both the old and the new address.
      </p>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        It cannot pause, upgrade, sweep, remove a corridor, change a corridor&apos;s assets, move anyone&apos;s funds, or alter a
        receipt. The contracts hold no balances between payouts and have no way to receive the native token at all.
      </p>

      <h2 className="m-0 mt-6 font-display text-[20px] font-medium tracking-[-.02em]">Reading the source</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Every contract above is verified, so Monadscan shows the Solidity itself. The same source, its tests and the research behind
        each integration are in{' '}
        <a href={REPO} target="_blank" rel="noreferrer" className="text-purple">
          the repository ↗
        </a>
        .
      </p>
    </>
  )
}
