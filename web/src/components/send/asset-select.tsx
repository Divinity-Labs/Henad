'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface AssetOption {
  value: string
  /** what the closed button shows, e.g. "GBP" */
  label: string
  /** the token icon, or a lettered disc */
  icon: ReactNode
  /** secondary line in the menu, e.g. "British pound · GBPm" */
  detail?: string
  /** right-hand badge in the menu, e.g. a tier pill */
  badge?: ReactNode
}

/**
 * The canvas chip ("GBP ▾") as a real menu: icons, a detail line and a tier badge per row,
 * none of which a native select can draw.
 *
 * It behaves as a listbox: Enter, Space or the arrow keys open it, the arrows move, Enter picks,
 * Escape and a click outside close it, and focus returns to the button.
 */
export function AssetSelect({ label, value, options, onChange }: { label: string; value: string; options: AssetOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function show() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    button.current?.focus()
  }

  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      button.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = options[active]
      if (o) pick(o.value)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrap} className="relative flex-none" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-label={`${label}: ${selected?.label ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : show())}
        className={`press inline-flex items-center gap-2 whitespace-nowrap rounded-full border bg-surface py-[5px] pl-[5px] pr-3 font-mono text-[12px] text-ink transition-colors ${open ? 'border-purple' : 'border-border hover:border-muted'}`}
      >
        {selected?.icon}
        <span>{selected?.label}</span>
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          className="absolute right-0 top-[calc(100%+6px)] z-20 m-0 flex w-[248px] list-none flex-col gap-[2px] rounded-[12px] border border-hairline bg-surface p-[6px] shadow-[0_18px_40px_-12px_rgba(14,9,28,.22)]"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.value)}
                className={`flex cursor-pointer items-center gap-[10px] rounded-[8px] px-2 py-[7px] ${i === active ? 'bg-tint' : ''}`}
              >
                {o.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`font-mono text-[12px] text-ink ${isSelected ? 'font-medium' : ''}`}>{o.label}</span>
                  {o.detail && <span className="truncate text-[11px] text-muted">{o.detail}</span>}
                </span>
                {o.badge}
                {isSelected && (
                  <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="flex-none text-purple">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
