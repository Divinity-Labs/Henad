'use client'

import { useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { loadStoredAccount } from './send-mera'

/** Fired in this tab when the stored account changes; `storage` only reaches other tabs. */
export const ACCOUNT_EVENT = 'henad:account'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(ACCOUNT_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(ACCOUNT_EVENT, onChange)
  }
}

/**
 * The address signed in on this browser: `undefined` while rendering on the server, where
 * storage cannot be read, then the address or null. Signing out in another tab, or in this
 * one through `forgetStoredAccount`, updates every reader.
 */
export function useStoredAddress(): Address | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => loadStoredAccount()?.address ?? null,
    () => undefined,
  )
}
