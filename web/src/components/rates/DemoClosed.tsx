'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

/** Renders its children only behind `?demo=closed`, so the closed-market banner can be reviewed while the market is open. */
export function DemoClosed({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  return params.get('demo') === 'closed' ? <>{children}</> : null
}
