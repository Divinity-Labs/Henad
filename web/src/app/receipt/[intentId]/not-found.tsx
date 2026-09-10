import Link from 'next/link'
import { Nav } from '@/components/Nav'

export default function ReceiptNotFound() {
  return (
    <div className="dotgrid min-h-dvh md:px-10">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col border-hairline bg-canvas md:border-x">
        <Nav showBuiltOn={false} right={<span className="label-md hidden whitespace-nowrap text-muted lg:inline">Public receipt · no wallet needed</span>} />
        <main className="flex max-w-[760px] flex-col gap-[14px] px-4 py-10 md:px-14 md:py-16">
          <p className="label-md m-0 text-purple">Receipt · 404</p>
          <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">No receipt with that id.</h1>
          <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
            A receipt id is the 32-byte intent hash of a settled payout. Check the link you were sent, or start from the live corridors.
          </p>
          <Link href="/rates" className="label-lg mt-2 text-ink">
            See live rates →
          </Link>
        </main>
      </div>
    </div>
  )
}
