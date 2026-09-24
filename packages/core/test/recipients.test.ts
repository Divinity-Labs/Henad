import { describe, expect, it } from 'vitest'
import { cleanName, notePayment, parseRecipient, payLink, readContacts, recipientLabel, saveContact, serializeContacts } from '../src/recipients'

const ADA = '0x2Ea1A81aa3931C2abF6F23421d7C1493a252EaA6'
const LOWER = ADA.toLowerCase()

describe('parseRecipient', () => {
  it('reads a pay link, with and without a scheme, and checksums the account', () => {
    for (const input of [`https://usehenad.xyz/pay/${LOWER}?n=Ada`, `usehenad.xyz/pay/${LOWER}?n=Ada`, `www.usehenad.xyz/pay/${LOWER}?n=Ada`]) {
      expect(parseRecipient(input)).toEqual({ kind: 'paylink', address: ADA, name: 'Ada' })
    }
  })

  it('reads the app scheme a QR code may carry', () => {
    expect(parseRecipient(`henad://pay/${LOWER}`)).toEqual({ kind: 'paylink', address: ADA, name: null })
  })

  it('refuses a lookalike host rather than trusting its account', () => {
    expect(parseRecipient(`https://usehenad.xyz.evil.com/pay/${LOWER}`).kind).not.toBe('paylink')
    expect(parseRecipient(`https://evil.com/pay/${LOWER}`).kind).not.toBe('paylink')
    expect(parseRecipient(`http://usehenad.xyz/pay/${LOWER}`).kind).not.toBe('paylink')
  })

  it('says so when a Henad link carries no valid account', () => {
    expect(parseRecipient('https://usehenad.xyz/pay/0x1234')).toMatchObject({ kind: 'invalid' })
  })

  it('still accepts a bare account number', () => {
    expect(parseRecipient(LOWER)).toEqual({ kind: 'address', address: ADA })
  })

  it('recognises a .nad name without resolving it', () => {
    expect(parseRecipient('Salmo.nad')).toEqual({ kind: 'nad', nadName: 'salmo.nad' })
  })

  it('returns empty and invalid rather than throwing', () => {
    expect(parseRecipient('   ').kind).toBe('empty')
    expect(parseRecipient('mum').kind).toBe('invalid')
  })
})

describe('names from links', () => {
  it('strips bidi overrides that would make a name render as something it is not', () => {
    const spoof = `\u202eadA`
    expect(cleanName(spoof)).toBe('adA')
    expect(parseRecipient(`https://usehenad.xyz/pay/${ADA}?n=${encodeURIComponent(spoof)}`)).toMatchObject({ name: 'adA' })
  })

  it('caps length and collapses whitespace', () => {
    expect(cleanName('  Ada   Okonkwo  ')).toBe('Ada Okonkwo')
    expect(cleanName('x'.repeat(200))!.length).toBe(40)
    expect(cleanName('\u200b\u200b')).toBeNull()
  })

  it('round-trips through payLink', () => {
    const link = payLink(ADA, 'Ada Okonkwo')
    expect(link).toBe(`https://usehenad.xyz/pay/${ADA}?n=Ada+Okonkwo`)
    expect(parseRecipient(link)).toEqual({ kind: 'paylink', address: ADA, name: 'Ada Okonkwo' })
  })
})

describe('contacts', () => {
  it('saves one entry per account, newest name wins, and survives storage', () => {
    let list = saveContact([], LOWER as `0x${string}`, 'Ada')
    list = saveContact(list, ADA, 'Ada O.')
    expect(list).toHaveLength(1)
    expect(readContacts(serializeContacts(list))).toEqual([{ address: ADA, name: 'Ada O.', lastPaidAt: null, payments: 0 }])
  })

  it('orders by who was paid most recently', () => {
    const B = '0x0000000000000000000000000000000000000b0b'
    let list = saveContact(saveContact([], ADA, 'Ada'), B, 'Bob')
    list = notePayment(list, B, 100)
    list = notePayment(list, ADA, 200)
    expect(list.map((c) => c.name)).toEqual(['Ada', 'Bob'])
  })

  it('drops malformed storage instead of breaking the screen', () => {
    expect(readContacts('not json')).toEqual([])
    expect(readContacts(JSON.stringify([{ address: 'nope', name: 'x' }, { address: ADA, name: '' }]))).toEqual([])
  })

  it('trusts the payer’s own name over a name from a link', () => {
    const contact = { address: ADA, name: 'Mum', lastPaidAt: null, payments: 0 } as const
    expect(recipientLabel({ address: ADA, contact, linkName: 'Somebody else' })).toEqual({ label: 'Mum', source: 'contact' })
    expect(recipientLabel({ address: ADA, linkName: 'Ada' })).toEqual({ label: 'Ada', source: 'link' })
    expect(recipientLabel({ address: ADA }).source).toBe('account')
  })
})
