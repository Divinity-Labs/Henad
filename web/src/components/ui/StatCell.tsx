import type { ReactNode } from 'react'

/** Hairline-divided stat: mono label over a display-face figure. */
export function StatCell({
  label,
  value,
  sub,
  size = 'md',
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const fig = size === 'lg' ? 'text-[30px]' : size === 'md' ? 'text-[24px]' : 'text-[20px]'
  const pad = size === 'lg' ? 'gap-2 px-9 py-7' : size === 'md' ? 'gap-[6px] px-[22px] py-4' : 'gap-1 px-4 py-[14px]'
  return (
    <div className={`flex flex-col ${pad} ${className}`}>
      <span className="label text-muted">{label}</span>
      <span className={`font-display font-medium tracking-[-.03em] leading-none ${fig}`}>
        {value}
        {sub ? <span className="text-muted text-[0.6em]"> {sub}</span> : null}
      </span>
    </div>
  )
}
