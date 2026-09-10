import type { ReactNode } from 'react'

/**
 * The W2 page frame: dot-grid gutters outside, a 1200px column with hairline
 * left and right edges inside. `banner` sits above the column at full width.
 * Below md the column fills the viewport and the gutters disappear.
 */
export function RatesFrame({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="dotgrid flex min-h-dvh flex-col">
      {banner}
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col bg-canvas md:border-x md:border-hairline">{children}</div>
    </div>
  )
}
