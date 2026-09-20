import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import { NavAccount } from '@/components/NavAccount'
import { FundView } from '@/components/fund/FundView'
import { MONAD_MAINNET_ID } from '@henad/core'
import { appChainId, isLocalFork } from '@/lib/chain'

export const metadata: Metadata = {
  title: 'Top up',
  description: 'Swap MON for the stablecoin a payout spends. A market swap on PancakeSwap, not a Henad payout.',
}

/** /top-up — MON into AUSD or USDC, in the same column as /send and /account. */
export default function FundPage() {
  const network = isLocalFork() ? 'Local fork' : appChainId() === MONAD_MAINNET_ID ? 'Monad mainnet' : 'Monad testnet'
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav right={<NavAccount />} />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Top up" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          <FundView network={network} />
        </section>
      </main>
    </div>
  )
}
