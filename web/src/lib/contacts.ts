'use client'

import { useMemo, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { CONTACTS_KEY, readContacts, serializeContacts, sortContacts, type Contact } from '@henad/core'

/**
 * The payer's contacts and their own display name, in this browser's storage.
 *
 * Contacts are namespaced by the signed-in account: two people sharing a laptop each keep
 * their own list, and signing out leaves a list where it is for the next sign-in rather than
 * handing it to whoever signs in after. Nothing here leaves the device.
 */

/** Fired in this tab when contacts change; `storage` only reaches other tabs. */
export const CONTACTS_EVENT = 'henad:contacts'
/** Fired in this tab when the display name changes. */
export const MY_NAME_EVENT = 'henad:my-name'
/**
 * The name the person gives themselves for their pay link. One per browser, like the account,
 * but stored with the account that set it: on a shared laptop the next person to sign in must
 * not be handed a link, a QR code and a header that carry the last person's name.
 */
export const MY_NAME_KEY = 'henad.myName'

export function contactsKey(owner: Address): string {
  return `${CONTACTS_KEY}:${owner.toLowerCase()}`
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Most recently paid first. Missing or blocked storage reads as no contacts, never as an error. */
export function loadContacts(owner: Address): Contact[] {
  return sortContacts(readContacts(read(contactsKey(owner))))
}

/** False when storage is blocked, so the screen can say the contact was not kept. */
export function storeContacts(owner: Address, list: Contact[]): boolean {
  let ok = true
  try {
    window.localStorage.setItem(contactsKey(owner), serializeContacts(list))
  } catch {
    ok = false
  }
  window.dispatchEvent(new Event(CONTACTS_EVENT))
  return ok
}

function subscribeTo(event: string) {
  return (onChange: () => void): (() => void) => {
    window.addEventListener('storage', onChange)
    window.addEventListener(event, onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener(event, onChange)
    }
  }
}

const subscribeContacts = subscribeTo(CONTACTS_EVENT)
const subscribeMyName = subscribeTo(MY_NAME_EVENT)

/**
 * The signed-in account's contacts, most recently paid first; empty on the server and while
 * signed out. The snapshot is the stored string, not the parsed list: useSyncExternalStore
 * compares snapshots by identity, and a freshly parsed array would never compare equal.
 */
export function useContacts(owner: Address | null | undefined): Contact[] {
  const raw = useSyncExternalStore(
    subscribeContacts,
    () => (owner ? read(contactsKey(owner)) : null),
    () => null,
  )
  return useMemo(() => sortContacts(readContacts(raw)), [raw])
}

/** The stored name if `owner` set it, else ''. Anything unreadable counts as no name. */
function readMyName(owner: Address): string {
  const raw = read(MY_NAME_KEY)
  if (!raw) return ''
  try {
    const v = JSON.parse(raw) as { owner?: unknown; name?: unknown }
    return v.owner === owner.toLowerCase() && typeof v.name === 'string' ? v.name : ''
  } catch {
    return ''
  }
}

/**
 * The signed-in account's display name as typed, '' when unset or signed out. Kept raw so a
 * space typed between two words survives the keystroke; `cleanName` runs where the name is
 * shown or put in a link. The snapshot is a string, so it compares equal by value.
 */
export function useMyName(owner: Address | null | undefined): string {
  return useSyncExternalStore(
    subscribeMyName,
    () => (owner ? readMyName(owner) : ''),
    () => '',
  )
}

export function storeMyName(owner: Address, name: string): void {
  try {
    if (name.trim()) window.localStorage.setItem(MY_NAME_KEY, JSON.stringify({ owner: owner.toLowerCase(), name: name.slice(0, 40) }))
    else window.localStorage.removeItem(MY_NAME_KEY)
  } catch {
    // Blocked storage: the account page keeps the name for this visit, and the link carries it.
  }
  window.dispatchEvent(new Event(MY_NAME_EVENT))
}
