import { getAddress, isAddress, type Address } from 'viem'

/**
 * The address inside a scanned QR code, or null when there is none.
 *
 * Accepts a bare address, which is what Henad's own profile QR holds, and the EIP-681 form
 * other wallets show (`ethereum:0x…@143`, sometimes with a `pay-` prefix or a path and query).
 * Anything else is refused rather than guessed at: a recipient field filled from the wrong
 * part of a payment URI would send money somewhere the person did not scan.
 */
export function addressFromScan(data: string): Address | null {
  let raw = data.trim()
  const scheme = /^ethereum:(pay-)?/i
  if (scheme.test(raw)) raw = raw.replace(scheme, '')
  raw = raw.split(/[@/?]/)[0] ?? ''
  return isAddress(raw, { strict: false }) ? getAddress(raw) : null
}
