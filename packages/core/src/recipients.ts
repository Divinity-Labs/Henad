import { getAddress, isAddress, type Address, type PublicClient } from 'viem'
import { namehash, normalize } from 'viem/ens'

/**
 * Who a payment is for, without asking anyone to read an address.
 *
 * Track 02 asks for "a payments app that never mentions a blockchain to the person using
 * it", and Henad's first decision used to be a field that wanted `0x…`. This module is the
 * shared answer for web and phone: a recipient arrives as a pay link someone shared, a `.nad`
 * name, a saved contact, or — still allowed, never the front door — a raw account number.
 *
 * One rule runs through it. **A name that arrives inside a link is a claim, not a fact.**
 * `?n=Mum` can be typed by anybody, so it is shown as "from the link" until the payer saves
 * the contact themselves, and the first payment to an address the payer has never paid is
 * called out as a first payment. Everything else here is convenience; that rule is safety.
 */

/** Where pay links live. Kept in core so both apps build the same link. */
export const PAY_ORIGIN = 'https://usehenad.xyz'

/** Nad Name Service on Monad mainnet, verified 24 Sep 2026: `salmo.nad` resolves. */
export const NNS_MAINNET = '0xCc7a1bfF8845573dbF0B3b96e25B9b549d4a2eC7' as const

const nnsAbi = [
  { type: 'function', name: 'getResolvedAddress', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'getPrimaryNameForAddress',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ type: 'string' }],
  },
] as const

/** The longest name a link may carry. Long enough for a full name, short enough to render. */
const NAME_MAX = 40

export type ParsedRecipient =
  | { kind: 'address'; address: Address }
  /** From a Henad pay link. `name` is whatever the link says, unverified. */
  | { kind: 'paylink'; address: Address; name: string | null }
  /** A `.nad` name, still to be resolved on chain. */
  | { kind: 'nad'; nadName: string }
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: string }

/**
 * A label from a link, made safe to render and short enough to fit.
 *
 * React escapes markup already; this is about what the label *says*. Control and
 * bidirectional-override characters are removed because they can make "Ada" render as
 * something the bytes do not spell, which is exactly the trick an impersonating link would use.
 */
export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    // Control characters and the Unicode bidi overrides and isolates (U+202A-202E, U+2066-2069).
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
  return cleaned.length > 0 ? cleaned : null
}

/**
 * Read whatever was pasted, scanned or tapped into a recipient.
 *
 * Accepts, most specific first: a Henad pay link (`https://usehenad.xyz/pay/0x…?n=Ada`, with
 * or without the scheme, or the `henad://pay/…` form a QR code may carry); a `.nad` name; a
 * bare account number. It never touches the network; `.nad` names come back unresolved.
 */
export function parseRecipient(input: string): ParsedRecipient {
  const text = input.trim()
  if (!text) return { kind: 'empty' }

  const link = parsePayLink(text)
  if (link) return link

  if (isAddress(text, { strict: false })) return { kind: 'address', address: getAddress(text) }

  const lower = text.toLowerCase()
  if (lower.endsWith('.nad')) {
    try {
      return { kind: 'nad', nadName: normalize(lower) }
    } catch {
      return { kind: 'invalid', reason: 'That name is not a valid .nad name.' }
    }
  }

  return { kind: 'invalid', reason: 'That is not a Henad link, a .nad name or an account number.' }
}

function parsePayLink(text: string): ParsedRecipient | null {
  // Tolerate a link pasted without its scheme, which is how links arrive from chat apps.
  const candidate = /^(https?:\/\/|henad:\/\/)/i.test(text) ? text : /^(www\.)?usehenad\.xyz\//i.test(text) ? `https://${text}` : null
  if (!candidate) return null
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  const henadWeb = /^(www\.)?usehenad\.xyz$/i.test(url.hostname) && url.protocol === 'https:'
  const henadApp = url.protocol === 'henad:'
  if (!henadWeb && !henadApp) return null
  // henad://pay/0x… parses with "pay" as the host; https://usehenad.xyz/pay/0x… as the path.
  const segments = (henadApp ? `${url.hostname}${url.pathname}` : url.pathname).split('/').filter(Boolean)
  if (segments[0] !== 'pay' || !segments[1]) return null
  const target = decodeURIComponent(segments[1])
  if (!isAddress(target, { strict: false })) return { kind: 'invalid', reason: 'That Henad link does not contain a valid account.' }
  return { kind: 'paylink', address: getAddress(target), name: cleanName(url.searchParams.get('n')) }
}

/** The link someone shares to get paid. The address rides in it; the screen never shows it. */
export function payLink(address: Address, name?: string | null): string {
  const url = new URL(`/pay/${getAddress(address)}`, PAY_ORIGIN)
  const label = cleanName(name)
  if (label) url.searchParams.set('n', label)
  return url.toString()
}

/**
 * A `.nad` name to the account it points at, or null when it points nowhere.
 *
 * Resolution proves only that someone registered the name. The screen shows the resolved
 * name and treats the first payment to it like any other first payment.
 */
export async function resolveNad(client: PublicClient, nadName: string): Promise<Address | null> {
  const resolved = await client.readContract({
    address: NNS_MAINNET,
    abi: nnsAbi,
    functionName: 'getResolvedAddress',
    args: [namehash(normalize(nadName))],
  })
  return resolved && resolved !== '0x0000000000000000000000000000000000000000' ? getAddress(resolved) : null
}

/** The `.nad` name an account has chosen for itself, without the suffix, or null. */
export async function primaryNad(client: PublicClient, address: Address): Promise<string | null> {
  try {
    const name = await client.readContract({ address: NNS_MAINNET, abi: nnsAbi, functionName: 'getPrimaryNameForAddress', args: [address] })
    return name ? `${name}.nad` : null
  } catch {
    return null
  }
}

/**
 * Someone the payer has paid, named by the payer.
 *
 * Contacts live on the device — web storage, SecureStore on the phone — and nowhere else.
 * A contact is the only kind of name Henad treats as trusted, because the payer typed it.
 */
export interface Contact {
  address: Address
  name: string
  /** Unix seconds of the last payment, for ordering the list by who you actually pay. */
  lastPaidAt: number | null
  payments: number
}

export const CONTACTS_KEY = 'henad.contacts.v1'

/** Parse stored contacts, dropping anything malformed rather than failing the screen. */
export function readContacts(raw: string | null | undefined): Contact[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list.flatMap((c): Contact[] => {
      if (!c || typeof c !== 'object') return []
      const { address, name, lastPaidAt, payments } = c as Record<string, unknown>
      if (typeof address !== 'string' || !isAddress(address, { strict: false })) return []
      const clean = cleanName(typeof name === 'string' ? name : null)
      if (!clean) return []
      return [
        {
          address: getAddress(address),
          name: clean,
          lastPaidAt: typeof lastPaidAt === 'number' ? lastPaidAt : null,
          payments: typeof payments === 'number' && payments >= 0 ? Math.floor(payments) : 0,
        },
      ]
    })
  } catch {
    return []
  }
}

/** Add or rename a contact. One entry per address; the newest name wins. */
export function saveContact(list: Contact[], address: Address, name: string): Contact[] {
  const clean = cleanName(name)
  if (!clean) return list
  const key = getAddress(address)
  const existing = list.find((c) => c.address === key)
  const next: Contact = existing ? { ...existing, name: clean } : { address: key, name: clean, lastPaidAt: null, payments: 0 }
  return sortContacts([next, ...list.filter((c) => c.address !== key)])
}

/** Record a payment to an address, so the list opens on the people actually paid. */
export function notePayment(list: Contact[], address: Address, at: number): Contact[] {
  const key = getAddress(address)
  return sortContacts(list.map((c) => (c.address === key ? { ...c, lastPaidAt: at, payments: c.payments + 1 } : c)))
}

export function removeContact(list: Contact[], address: Address): Contact[] {
  const key = getAddress(address)
  return list.filter((c) => c.address !== key)
}

export function findContact(list: Contact[], address: Address | null | undefined): Contact | null {
  if (!address) return null
  const key = getAddress(address)
  return list.find((c) => c.address === key) ?? null
}

/** Most recently paid first, then never-paid contacts by name. */
export function sortContacts(list: Contact[]): Contact[] {
  return [...list].sort((a, b) => (b.lastPaidAt ?? -1) - (a.lastPaidAt ?? -1) || a.name.localeCompare(b.name))
}

export function serializeContacts(list: Contact[]): string {
  return JSON.stringify(list)
}

/**
 * What to call an account on screen, in order of how much the payer can trust it: their own
 * contact name, then a `.nad` name, then a name from the link marked as such, then a shortened
 * account number as the last resort.
 */
export function recipientLabel(opts: { address: Address; contact?: Contact | null; nadName?: string | null; linkName?: string | null }): {
  label: string
  source: 'contact' | 'nad' | 'link' | 'account'
} {
  if (opts.contact) return { label: opts.contact.name, source: 'contact' }
  if (opts.nadName) return { label: opts.nadName, source: 'nad' }
  const fromLink = cleanName(opts.linkName)
  if (fromLink) return { label: fromLink, source: 'link' }
  return { label: `Account ${opts.address.slice(2, 6).toUpperCase()}…${opts.address.slice(-4).toUpperCase()}`, source: 'account' }
}
