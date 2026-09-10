'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

type State = 'idle' | 'copied' | 'failed'

const LABEL: Record<State, string> = {
  idle: 'Copy permalink',
  copied: 'Copied',
  failed: 'Copy failed · use the address bar',
}

/** Copies the receipt permalink and confirms in place. Relative URLs resolve against the page. */
export function CopyPermalink({ url }: { url: string }) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    const absolute = new URL(url, window.location.href).toString()
    try {
      await navigator.clipboard.writeText(absolute)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1800)
  }

  return (
    <Button variant="secondary" size="lg" onClick={copy} aria-live="polite">
      {LABEL[state]}
    </Button>
  )
}
