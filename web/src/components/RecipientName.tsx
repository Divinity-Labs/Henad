'use client'

import { getAddress, isAddress } from 'viem'
import { findContact, recipientLabel } from '@henad/core'
import { useContacts } from '@/lib/contacts'
import { useStoredAddress } from '@/lib/use-stored-address'

/**
 * Who a receipt paid, in the words of whoever is looking at it: their own contact name when
 * they have one for that account, otherwise "Account 2EA1…EAA6".
 *
 * Receipts are public pages rendered on the server, where there are no contacts, so the
 * server and the first client render both say "Account …" and the name arrives after
 * hydration. A link's name is never used here: a receipt is a record, and a record does not
 * repeat an unverified claim.
 */
export function RecipientName({ address }: { address: string }) {
  const owner = useStoredAddress()
  const contacts = useContacts(owner)
  if (!isAddress(address, { strict: false })) return <>{address}</>
  const account = getAddress(address)
  return <>{recipientLabel({ address: account, contact: findContact(contacts, account) }).label}</>
}
