'use client'

import { useEffect, useRef, useState } from 'react'

const summaryCls = 'press flex cursor-pointer list-none items-center justify-between font-mono text-[10px] uppercase tracking-[.08em] text-muted [&::-webkit-details-marker]:hidden'

/**
 * A full account number behind a closed disclosure, with a copy button.
 *
 * The number is never the way in: people are paid by link, by contact, or by name. It stays
 * one tap away because someone sending from an exchange or checking a payment by hand needs
 * all 42 characters, exactly, and a shortened one is useless to them. A native `<details>`,
 * so it opens without script and a screen reader announces it as expandable.
 */
export function AccountNumber({ address, summary = 'Details', note, className = '' }: { address: string; summary?: string; note?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked; the number is selectable text right above the button.
    }
  }

  return (
    <details className={`group ${className}`}>
      <summary className={summaryCls}>
        <span>{summary}</span>
        <span aria-hidden className="text-purple group-open:hidden">
          Show
        </span>
        <span aria-hidden className="hidden text-purple group-open:inline">
          Hide
        </span>
      </summary>
      <div className="flex flex-col gap-2 pt-[10px]">
        <p className="m-0 break-all font-mono text-[12px] leading-[1.5] text-ink tabular select-all">{address}</p>
        <div className="flex items-center justify-between gap-3">
          {note ? <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">{note}</p> : <span />}
          <button type="button" onClick={() => void copy()} className="press label flex-none text-purple">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Account number copied' : ''}
        </span>
      </div>
    </details>
  )
}
