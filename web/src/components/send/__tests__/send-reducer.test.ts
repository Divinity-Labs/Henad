import { describe, expect, it } from 'vitest'
import { LIVE_CORRIDOR, type QuoteDto } from '@henad/core'
import { initialState, sendReducer, type SendInitial, type SendState } from '../send-reducer'

const ADA = '0x2Ea1A81aa3931C2abF6F23421d7C1493a252EaA6'
const PAYER = '0x9c41D2E3F4a5B6C7D8E9f0A1b2C3d4e5F6a7B7E0'
const OTHER = '0x1111111111111111111111111111111111111111'

const base: SendInitial = { now: 0, corridorKey: LIVE_CORRIDOR.key, rates: [], latestReceipt: null, demo: null, sampleReceipt: null }

const QUOTE: QuoteDto = {
  source: 'AUSD',
  target: 'GBP',
  sourceAmount: '10000000',
  quotedAmountOut: '7400000000000000000',
  referenceRate: '740000000000000000',
  observation: '0x00',
  marketOpen: true,
  feedUpdatedAt: 0,
  expiresAt: 60_000,
}

function signedIn(s: SendState, address: `0x${string}` = PAYER): SendState {
  return sendReducer(s, { type: 'signedIn', address, credentialId: 'cred' })
}

describe('recipient from a pay link', () => {
  it('starts with the link account chosen and its name kept as the link name', () => {
    const s = initialState({ ...base, recipient: ADA, recipientName: 'Ada', recipientSource: 'link' })
    expect(s.recipient).toBe(ADA)
    expect(s.recipientName).toBe('Ada')
    expect(s.recipientNad).toBeNull()
    expect(s.editingRecipient).toBe(false)
  })

  it('opens the picker when there is no link', () => {
    const s = initialState(base)
    expect(s.recipient).toBeNull()
    expect(s.editingRecipient).toBe(true)
  })
})

describe('choosing a recipient', () => {
  it('replaces the last choice, clears the field and closes the picker', () => {
    let s = initialState({ ...base, recipient: ADA, recipientName: 'Ada', recipientSource: 'link' })
    s = sendReducer(s, { type: 'editRecipient', editing: true })
    s = sendReducer(s, { type: 'recipientInput', value: 'salmo.nad' })
    s = sendReducer(s, { type: 'chooseRecipient', address: OTHER, linkName: null, nadName: 'salmo.nad' })
    expect(s).toMatchObject({ recipient: OTHER, recipientName: null, recipientNad: 'salmo.nad', recipientInput: '', editingRecipient: false })
  })

  it('keeps the recipient for the next payout', () => {
    let s = signedIn(initialState({ ...base, recipient: ADA, recipientName: 'Ada', recipientSource: 'link' }))
    s = sendReducer(s, { type: 'again' })
    expect(s.recipient).toBe(ADA)
  })
})

describe('the stored account changing under the page', () => {
  it('forgets the recipient on sign-out', () => {
    let s = signedIn(initialState({ ...base, recipient: ADA, recipientName: 'Ada', recipientSource: 'link' }))
    s = sendReducer(s, { type: 'storedAccount', account: null })
    expect(s).toMatchObject({ account: null, recipient: null, recipientName: null, step: 'signin' })
  })

  it('ignores the same account written again, mid-payout included', () => {
    let s = signedIn(initialState({ ...base, recipient: ADA, recipientSource: 'link' }))
    s = sendReducer(s, { type: 'busy', busy: 'send' })
    expect(sendReducer(s, { type: 'storedAccount', account: { address: PAYER, credentialId: 'cred' } })).toBe(s)
  })

  it('drops the recipient when a different account signs in', () => {
    let s = signedIn(initialState({ ...base, recipient: ADA, recipientSource: 'link' }))
    s = sendReducer(s, { type: 'storedAccount', account: { address: OTHER, credentialId: 'other' } })
    expect(s.account?.address).toBe(OTHER)
    expect(s.recipient).toBeNull()
  })

  // The next recipient chosen must not reopen the last account's quote and send it.
  it("drops the last account's quote and returns to the amount screen", () => {
    let s = signedIn(initialState({ ...base, recipient: ADA, recipientSource: 'link' }))
    s = sendReducer(s, { type: 'amount', value: '10' })
    s = sendReducer(s, { type: 'quoted', quote: QUOTE })
    expect(s.step).toBe('quote')
    s = sendReducer(s, { type: 'storedAccount', account: { address: OTHER, credentialId: 'other' } })
    expect(s).toMatchObject({ step: 'amount', quote: null, receipt: null, txHash: null, recipient: null })
    s = sendReducer(s, { type: 'chooseRecipient', address: ADA, linkName: null, nadName: null })
    expect(s.step).toBe('amount')
  })

  it('drops the quote on sign-out as well', () => {
    let s = sendReducer(signedIn(initialState(base)), { type: 'quoted', quote: QUOTE })
    s = sendReducer(s, { type: 'storedAccount', account: null })
    expect(s).toMatchObject({ step: 'signin', quote: null })
  })
})
