import Link from 'next/link'
import { BuiltOnMonad } from '@/components/ui/Brand'
import { Button } from '@/components/ui/Button'
import { CORRIDORS } from '@/lib/corridors'
import type { Receipt } from '@/lib/receipts'
import { capitalise, countWord } from './ledger'

const sources = CORRIDORS.filter((c) => c.feed !== null).length
const absences = CORRIDORS.filter((c) => c.feed === null).length
const MRC_LINE = `${capitalise(countWord(sources))} live rate sources · ${
  absences === 1 ? 'one documented absence' : `${countWord(absences)} documented absences`
} · Henad is the reference implementation`

/**
 * The closing call: send a payout, and beside it the dark "MRC" panel. The
 * secondary action opens the latest receipt, or the rates before the first one.
 */
export function Cta({ latest }: { latest: Receipt | null }) {
  const secondary = latest
    ? { href: `/receipt/${latest.intentId}`, label: `View receipt${latest.index ? ` #${latest.index}` : ''}` }
    : { href: '/rates', label: 'See live rates' }
  return (
    <>
      <section className="hidden md:grid grid-cols-[1fr_480px] border-b border-hairline" aria-labelledby="cta-heading">
        <div className="flex flex-col justify-center gap-[22px] py-20 pl-9 pr-12">
          <h2 id="cta-heading" className="m-0 max-w-[560px] font-display font-medium text-[48px] tracking-[-.03em] leading-[1.05] pretty">
            Send your first payout. Keep the receipt.
          </h2>
          <p className="m-0 max-w-[520px] text-[17px] leading-[1.6] text-grey pretty">
            A stranger with a phone can open Henad, sign in with a passkey, and send dollars to pounds without reading instructions. Try it with a
            trivial amount.
          </p>
          <div className="flex gap-3">
            <Button href="/send" size="lg">
              Send a payout
            </Button>
            <Button href={secondary.href} variant="secondary" size="lg">
              {secondary.label}
            </Button>
          </div>
        </div>
        <Link
          href="/docs/mrc"
          className="relative overflow-hidden grain flex flex-col justify-between min-h-[420px] border-l border-hairline bg-ink p-8 text-white"
          style={{ backgroundImage: 'radial-gradient(ellipse 100% 70% at 50% 100%, #6E54FF 0%, #3B2A9E 40%, #0E091C 100%)' }}
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 font-display font-semibold text-[150px] leading-none tracking-[-.05em] pointer-events-none select-none"
          >
            MRC
          </span>
          <span className="relative flex items-center justify-between">
            <span className="font-mono uppercase text-[11px] tracking-[.12em] text-lilac">Proposing</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[14px] text-ink">↗</span>
          </span>
          <span className="relative flex flex-col gap-2">
            <span className="font-display font-medium text-[20px] tracking-[-.02em] leading-[1.25] pretty">
              A Monad application standard for verifiable FX settlement receipts
            </span>
            <span className="label-md text-lilac">{MRC_LINE}</span>
          </span>
        </Link>
      </section>
      <section className="flex md:hidden flex-col gap-4 px-4 pt-10 pb-8">
        <h2 className="m-0 font-display font-medium text-[30px] tracking-[-.03em] leading-[1.05]">Send your first payout. Keep the receipt.</h2>
        <Button href="/send" size="xl" block>
          Send a payout
        </Button>
        <div className="flex flex-col gap-[10px] font-mono uppercase text-[10px] tracking-[.08em] text-muted">
          <span>No fiat · No custody · No KYC</span>
          <BuiltOnMonad height={11} />
        </div>
      </section>
    </>
  )
}
