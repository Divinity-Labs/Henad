import { capitalise, countWord } from './ledger'

/**
 * "Delivered so far on Monad" over the total as giant ghost type. With no
 * settlement the figure is the fixture's, and the caption says so.
 */
export function DeliveredBand({ figure, settlements, sample, explorer }: { figure: string; settlements: number; sample: boolean; explorer: string | null }) {
  const caption = sample
    ? 'Sample figure · settlement #1 is next'
    : settlements === 1
      ? 'One settlement · one receipt · every figure provable'
      : `${capitalise(countWord(settlements))} settlements · ${countWord(settlements)} receipts · every figure provable`
  const onMonad = (
    <>
      on
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/monad-logomark.svg" alt="" className="block h-[30px] w-auto" />
      Monad
    </>
  )
  return (
    <section
      className="hidden md:flex relative overflow-hidden items-center justify-center min-h-[380px] border-b border-hairline"
      style={{ background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(221,215,254,.7), transparent 70%)' }}
      aria-labelledby="delivered-heading"
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display font-medium text-[clamp(160px,23vw,300px)] leading-none tracking-[-.05em] text-ghost-2 whitespace-nowrap pointer-events-none select-none tabular"
      >
        {figure}
      </div>
      <div className="relative flex flex-col items-center gap-[10px] text-center">
        <h2 id="delivered-heading" className="m-0 flex flex-col items-center gap-[10px] font-display font-medium text-[36px] tracking-[-.03em] leading-[1.1]">
          <span>Delivered so far</span>
          {explorer ? (
            <a href={explorer} target="_blank" rel="noreferrer" className="flex items-center gap-[10px]">
              {onMonad}
              <span className="text-muted text-[28px]">↗</span>
            </a>
          ) : (
            <span className="flex items-center gap-[10px]">{onMonad}</span>
          )}
        </h2>
        <p className="m-0 pt-2 font-mono uppercase text-[11px] tracking-[.1em] text-grey">{caption}</p>
      </div>
    </section>
  )
}
