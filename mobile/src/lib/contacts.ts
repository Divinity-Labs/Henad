import * as SecureStore from 'expo-secure-store'
import { isAddress, type Address } from 'viem'
import {
  CONTACTS_KEY,
  cleanName,
  findContact,
  parseRecipient,
  readContacts,
  recipientLabel,
  serializeContacts,
  sortContacts,
  type Contact,
  type ParsedRecipient,
} from '@henad/core'

/**
 * The people this device has paid, and the name this person goes by on their own pay link.
 *
 * Both stay on the phone, and both are kept per signed-in account. Contacts are the only names
 * Henad trusts, because the payer typed them: a second account on the same phone must not
 * inherit the first one's "Mum", nor put the first one's name on its own pay link.
 */

/**
 * `henad.contacts.v1.<address>` rather than the web's `henad.contacts.v1:<address>`.
 * SecureStore refuses any key with a character outside letters, digits, `.`, `-` and `_`, and
 * throws rather than stores, so the colon the web uses would lose every contact on the phone.
 */
function contactsKey(owner: Address): string {
  return `${CONTACTS_KEY}.${owner.toLowerCase()}`
}

/**
 * Most recently paid first, which is the order the send screen opens on.
 *
 * SecureStore advises values under 2048 bytes and only warns past it today; that is about
 * twenty contacts, which is further than a first release will be pushed.
 */
export async function loadContacts(owner: Address): Promise<Contact[]> {
  try {
    return sortContacts(readContacts(await SecureStore.getItemAsync(contactsKey(owner))))
  } catch {
    return []
  }
}

export async function storeContacts(owner: Address, list: Contact[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(contactsKey(owner), serializeContacts(list))
  } catch {
    // Storage refused. The contact lasts until the app closes, and the next payment offers again.
  }
}

/** `henad.myName.<address>`, with a dot for the same reason the contacts key has one. */
function myNameKey(owner: Address): string {
  return `henad.myName.${owner.toLowerCase()}`
}

/** The name this person put on their own pay link, or null when they chose none. */
export async function loadMyName(owner: Address): Promise<string | null> {
  try {
    return cleanName(await SecureStore.getItemAsync(myNameKey(owner)))
  } catch {
    return null
  }
}

export async function storeMyName(owner: Address, name: string | null): Promise<void> {
  try {
    if (name) await SecureStore.setItemAsync(myNameKey(owner), name)
    else await SecureStore.deleteItemAsync(myNameKey(owner))
  } catch {
    // Refused storage costs only the name on the link; the link itself still works.
  }
}

/** What the screen says when an account number's letters do not match its own checksum. */
export const MISTYPED = 'That account number has a mistake in it. Copy it again.'

/**
 * `parseRecipient` for everything on the phone that reads a recipient: typing, Paste, the
 * scanner and a tapped link.
 *
 * It adds two things the shared parser does not do. The parser throws on a pay link with a
 * broken percent-escape (`/pay/%zz`), and an error thrown inside a URL event, a barcode callback
 * or onChangeText closes the app in a release build; here it becomes a reason on screen. And the
 * parser takes any account number of the right shape, so a mixed-case one with a wrong character
 * passed, and the shortened "Account 2EA1…EAA6" label would never show where the mistake was.
 */
export function safeParseRecipient(text: string): ParsedRecipient {
  let parsed: ParsedRecipient
  try {
    parsed = parseRecipient(text)
  } catch {
    return { kind: 'invalid', reason: 'That Henad link is damaged. Ask them to send it again.' }
  }
  if ((parsed.kind === 'address' || parsed.kind === 'paylink') && mistyped(text, parsed.address)) {
    return { kind: 'invalid', reason: MISTYPED }
  }
  return parsed
}

/**
 * Whether the account number as written in `text` fails its own checksum.
 *
 * The mix of capital and small letters in an account number is a checksum (EIP-55), so one
 * wrong character almost always breaks it. A number written all in one case carries no
 * checksum and has nothing to check; that is how most people copy one, so it still passes.
 */
export function mistyped(text: string, address: Address): boolean {
  const written = text.match(/0x[0-9a-fA-F]{40}/g)?.find((m) => m.toLowerCase() === address.toLowerCase())
  if (!written) return false
  const hex = written.slice(2)
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return false
  // viem's isAddress is strict by default: mixed case must match the checksum.
  return !isAddress(written)
}

/**
 * Who the payer has chosen, and how Henad came to know them.
 *
 * The label is not stored here. It is worked out against the contacts every time it is
 * shown, so saving someone as a contact renames them everywhere at once, and a name that
 * came in a link can never outlive the payer's own choice of name.
 */
export interface Recipient {
  address: Address
  /** What the pay link said. A claim, not a fact. */
  linkName?: string | null
  /** The `.nad` name it was found by. */
  nadName?: string | null
}

export type RecipientSource = ReturnType<typeof recipientLabel>['source']

export function describeRecipient(r: Recipient, contacts: Contact[]): { label: string; source: RecipientSource; contact: Contact | null } {
  const contact = findContact(contacts, r.address)
  return { ...recipientLabel({ address: r.address, contact, nadName: r.nadName, linkName: r.linkName }), contact }
}

/** The second line under a recipient's name: where that name came from, in words. */
export function sourceLine(source: RecipientSource, nadName?: string | null): string {
  if (source === 'contact') return 'Saved contact'
  if (source === 'link') return 'From their Henad link — not verified'
  if (source === 'nad') return `Found by the name ${nadName ?? ''}`.trim()
  return 'New account'
}

/** "AO" for Ada Okonkwo; the first two characters of the account when there is no name. */
export function initials(label: string, source: RecipientSource, address: Address): string {
  if (source === 'account') return address.slice(2, 4).toUpperCase()
  // Array.from splits by code point, so a name that starts with an emoji keeps the whole emoji.
  const words = label.replace(/\.nad$/i, '').split(/[\s._-]+/).filter(Boolean).map((w) => Array.from(w))
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0] ?? '').join('') : (words[0] ?? []).slice(0, 2).join('')
  return letters.toUpperCase() || address.slice(2, 4).toUpperCase()
}
