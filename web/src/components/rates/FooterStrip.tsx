/**
 * The closing strip: sources on the left, "Verified on Monad · Monadscan" on
 * the right at md and up. Below md it is the S4 footer line without a border.
 */
export function FooterStrip({ explorer }: { explorer: string }) {
  return (
    <footer className="flex items-center justify-between gap-4 px-4 py-[14px] font-mono text-[9px] tracking-[.08em] uppercase text-muted md:border-t md:border-hairline md:px-9 md:py-[18px] md:text-[10px]">
      <div className="flex flex-1 justify-between md:flex-none md:justify-start md:gap-6">
        <span>Indexed on-chain</span>
        <span>Rates by Chainlink · Pyth · Mento</span>
      </div>
      <a href={explorer} target="_blank" rel="noreferrer" className="hidden items-center gap-2 md:flex">
        Verified on
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/monad-full-black.svg" alt="Monad" className="block h-3 w-auto opacity-85" />
        <span>· Monadscan ↗</span>
      </a>
    </footer>
  )
}
