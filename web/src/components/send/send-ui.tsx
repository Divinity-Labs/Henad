import type { ReactNode } from 'react'

/** Small pieces the send artboards share: the step header, the white card, the row table, the chip select, the notice line. */

/** The canvas' small uppercase link label: mono 10px, .08em. */
export const linkLabel = 'font-mono text-[10px] uppercase tracking-[.08em]'

export function StepHeader({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="label flex items-center justify-between text-purple">
      <h1 className="label m-0 font-normal">{left}</h1>
      <span className="text-muted">{right}</span>
    </div>
  )
}

export function Card({ children, className = '', dim = false }: { children: ReactNode; className?: string; dim?: boolean }) {
  return <div className={`rounded-[12px] border border-hairline bg-surface ${dim ? 'opacity-55' : ''} ${className}`}>{children}</div>
}

export interface Row {
  k: string
  v: ReactNode
  strong?: boolean
}

/** Hairline-divided key/value rows in mono 11px with tabular figures. */
export function Rows({ rows, pad = 'py-2' }: { rows: Row[]; pad?: string }) {
  return (
    <Card className="px-[14px] font-mono text-[11px] tabular">
      {rows.map((r, i) => (
        <div key={r.k} className={`flex items-center justify-between gap-3 ${pad} ${i < rows.length - 1 ? 'border-b border-hairline-2' : ''}`}>
          <span className="text-muted">{r.k}</span>
          <span className={`text-right ${r.strong ? 'font-medium' : ''}`}>{r.v}</span>
        </div>
      ))}
    </Card>
  )
}

/** Inline problem or confirmation line. Says what happened and what to do next. */
export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`m-0 border-l-2 pl-3 text-[12px] leading-[1.5] text-grey-2 pretty ${tone === 'error' ? 'border-amber' : 'border-purple'}`}
    >
      {children}
    </p>
  )
}
