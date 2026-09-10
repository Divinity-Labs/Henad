import Link from 'next/link'
import { Nav } from '@/components/Nav'

export default function NotFound() {
  return (
    <div className="dotgrid min-h-dvh md:px-10">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col border-hairline bg-canvas md:border-x">
        <Nav />
        <main className="flex max-w-[760px] flex-col gap-[14px] px-4 py-10 md:px-14 md:py-16">
          <p className="label-md m-0 text-purple">404</p>
          <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">There is no page at that address.</h1>
          <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">Check the link, or start from the home page or the live corridors.</p>
          <div className="mt-2 flex flex-wrap gap-6 label-lg">
            <Link href="/" className="text-ink">
              Home →
            </Link>
            <Link href="/rates" className="text-ink">
              See live rates →
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}
