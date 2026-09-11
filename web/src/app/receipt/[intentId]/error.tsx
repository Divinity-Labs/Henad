'use client'

import Link from 'next/link'
import { Nav } from '@/components/Nav'
import { Button } from '@/components/ui/Button'

/** Chain-read failure for the receipt route: says what happened and offers a retry. Same frame as not-found. */
export default function ReceiptError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="dotgrid min-h-dvh md:px-10">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col border-hairline bg-canvas md:border-x">
        <Nav showBuiltOn={false} right={<span className="label-md hidden whitespace-nowrap text-muted lg:inline">Public receipt · no wallet needed</span>} />
        <main className="flex max-w-[760px] flex-col gap-[14px] px-4 py-10 md:px-14 md:py-16">
          <p className="label-md m-0 text-purple">Receipt · error</p>
          <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">The chain read failed.</h1>
          <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
            Henad could not read this receipt from Monad just now. The attestation is still on the chain; try again in a moment.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-6">
            <Button variant="primary" size="md" onClick={reset}>
              Try again
            </Button>
            <Link href="/rates" className="label-lg text-ink">
              See live rates →
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}
