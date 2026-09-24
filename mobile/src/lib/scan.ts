import { getAddress, isAddress } from 'viem'
import type { ParsedRecipient } from '@henad/core'
import { MISTYPED, mistyped, safeParseRecipient } from '@/lib/contacts'

export type ScannedRecipient = Extract<ParsedRecipient, { kind: 'paylink' | 'address' | 'nad' }>
type Refused = { kind: 'invalid'; reason: string }

/**
 * Who a scanned QR code says to pay, or why it cannot be used.
 *
 * Henad's own QR holds a pay link, so it goes through the same parser as a typed or tapped
 * link and brings the name it carries, marked as the link's claim. Other wallets show a bare
 * account number or an EIP-681 payment request, which is still accepted. Anything else is
 * refused rather than guessed at: a recipient filled from the wrong part of a payment URI would
 * send money somewhere the person did not scan.
 */
export function recipientFromScan(data: string): ScannedRecipient | Refused {
  const parsed = safeParseRecipient(data)
  if (parsed.kind === 'paylink' || parsed.kind === 'address' || parsed.kind === 'nad') return parsed
  return fromPaymentUri(data) ?? { kind: 'invalid', reason: parsed.kind === 'invalid' ? parsed.reason : 'That QR code is not a Henad link or an account.' }
}

/**
 * The person an EIP-681 request names: `ethereum:[pay-]<target>[@chain][/function][?params]`.
 *
 * With no function the target is the person. A token `transfer` is how other wallets show a
 * receive code for a token, and there the target is the token's contract and the person is the
 * `address` parameter; the contract taken as the recipient would swallow the money. Any other
 * function is not a payment to a person, so it is refused. The address parameter is matched as
 * plain hex rather than decoded, so a malformed escape elsewhere in the query cannot throw.
 */
function fromPaymentUri(data: string): ScannedRecipient | Refused | null {
  const m = /^ethereum:(?:pay-)?([^@/?]+)(?:@[^/?]*)?(?:\/([^?]*))?(?:\?(.*))?$/i.exec(data.trim())
  if (!m) return null
  const [, target = '', fn, query = ''] = m
  let raw = target
  if (fn) {
    if (fn.toLowerCase() !== 'transfer') return null
    raw = /(?:^|&)address=(0x[0-9a-fA-F]{40})(?:&|$)/.exec(query)?.[1] ?? ''
  }
  if (!isAddress(raw, { strict: false })) return null
  const address = getAddress(raw)
  return mistyped(raw, address) ? { kind: 'invalid', reason: MISTYPED } : { kind: 'address', address }
}
