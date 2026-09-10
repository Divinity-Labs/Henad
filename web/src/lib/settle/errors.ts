import { decodeErrorResult, hexToBigInt, isHex, size, slice, type Hex } from 'viem'
import { corridorRouterAbi } from '@henad/core'
import type { GasPath } from './types'

/**
 * Revert decoding for both settlement paths. The router's own errors come from
 * its ABI; Mento Router, OracleAdapter and FPMM errors bubble through the venue
 * unchanged (facts §14.1) and are matched by the selectors verified there.
 */

export type ErrorSource = 'router' | 'mento' | 'oracle' | 'fpmm' | 'solidity' | 'unknown'

export interface DecodedSettleError {
  name: string
  message: string
  source: ErrorSource
  selector: Hex
  args?: readonly unknown[]
}

/** facts §14.1 — every selector re-derived from its signature in the unit tests. */
export const VENUE_ERROR_SELECTORS: Record<Hex, { name: string; source: ErrorSource; message: string }> = {
  '0x203d82d8': { name: 'Expired', source: 'mento', message: 'The venue deadline passed before the swap executed.' },
  '0x42301c23': { name: 'InsufficientOutputAmount', source: 'mento', message: 'The venue could not deliver the minimum output; the quote moved.' },
  '0x9c8787c0': { name: 'PoolDoesNotExist', source: 'mento', message: 'No Mento pool exists for this pair.' },
  '0xa407143a': { name: 'FXMarketClosed', source: 'oracle', message: 'The FX market is closed for this corridor.' },
  '0x4ac30c22': { name: 'TradingSuspended', source: 'oracle', message: 'Trading is suspended by the oracle circuit breaker.' },
  '0xeb0d3e81': { name: 'NoRecentRate', source: 'oracle', message: 'The oracle has no recent rate for this corridor.' },
  '0x6a43f8d1': { name: 'InvalidRate', source: 'oracle', message: 'The oracle rate is invalid.' },
  '0xbb55fd27': { name: 'InsufficientLiquidity', source: 'fpmm', message: 'The Mento pool has insufficient liquidity.' },
  '0x8aa3a72f': { name: 'InvalidToAddress', source: 'fpmm', message: 'The recipient cannot be a pool token address.' },
  '0x493e48f0': { name: 'L0LimitExceeded', source: 'fpmm', message: 'The pool has hit its 5-minute trading limit.' },
  '0x91336c69': { name: 'L1LimitExceeded', source: 'fpmm', message: 'The pool has hit its daily trading limit.' },
  '0x098fb561': { name: 'InsufficientInputAmount', source: 'fpmm', message: 'The venue received less input than expected.' },
}

const ERROR_STRING_SELECTOR: Hex = '0x08c379a0'
const PANIC_SELECTOR: Hex = '0x4e487b71'

const PANIC_CODES: Record<string, string> = {
  '0x1': 'assertion failed',
  '0x11': 'arithmetic overflow or underflow',
  '0x12': 'division by zero',
  '0x21': 'invalid enum value',
  '0x22': 'corrupted storage byte array',
  '0x31': 'pop on an empty array',
  '0x32': 'array index out of bounds',
  '0x41': 'out of memory',
  '0x51': 'call to an uninitialised function',
}

function formatArg(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function routerMessage(name: string, args: readonly unknown[]): string {
  switch (name) {
    case 'SpreadTooWide':
      return `Spread of ${formatArg(args[0])} bps exceeds the ${formatArg(args[1])} bps you allowed.`
    case 'InsufficientDelivery':
      return `Delivered ${formatArg(args[0])} but the intent requires at least ${formatArg(args[1])}.`
    case 'IntentExpired':
      return 'The intent deadline has passed.'
    case 'IntentNotOpen':
      return 'This intent was already settled or cancelled.'
    case 'AuthorizationUsed':
      return 'This authorization has already been consumed.'
    case 'CorridorNotRegistered':
      return 'The router has no corridor registered for this pair.'
    case 'NotPayer':
      return 'Only the payer may settle this intent.'
    case 'InvalidIntent':
      return `Invalid intent: ${formatArg(args[0])}.`
    default:
      return args.length ? `${name}(${args.map(formatArg).join(', ')})` : name
  }
}

/** Turn raw revert data into something the send UI can show. Never throws. */
export function decodeSettleError(data: Hex): DecodedSettleError {
  if (!isHex(data) || size(data) < 4) {
    return { name: 'Unknown', message: 'Reverted without a reason.', source: 'unknown', selector: '0x' }
  }
  const selector = slice(data, 0, 4)
  const venue = VENUE_ERROR_SELECTORS[selector]
  if (venue) return { ...venue, selector }

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const { args } = decodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], data })
      const reason = String(args[0])
      return { name: 'Error', message: reason, source: 'solidity', selector, args }
    } catch {
      return { name: 'Error', message: 'Reverted with an undecodable reason string.', source: 'solidity', selector }
    }
  }
  if (selector === PANIC_SELECTOR) {
    const code = size(data) >= 36 ? `0x${hexToBigInt(slice(data, 4, 36)).toString(16)}` : '0x0'
    return { name: 'Panic', message: `Panic: ${PANIC_CODES[code] ?? `code ${code}`}.`, source: 'solidity', selector, args: [code] }
  }
  try {
    const { errorName, args = [] } = decodeErrorResult({ abi: corridorRouterAbi, data })
    return { name: errorName, message: routerMessage(errorName, args), source: 'router', selector, args }
  } catch {
    return { name: 'Unknown', message: `Reverted with unknown selector ${selector}.`, source: 'unknown', selector }
  }
}

interface ErrorLike {
  data?: unknown
  details?: unknown
  message?: unknown
  shortMessage?: unknown
  cause?: unknown
}

function causeChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    chain.push(current as ErrorLike)
    current = (current as ErrorLike).cause
  }
  return chain
}

function hexData(value: unknown): Hex | undefined {
  return typeof value === 'string' && isHex(value) && size(value) >= 4 ? value : undefined
}

/**
 * Pull revert data out of any error viem, a bundler or a fetch throws. Structured
 * `data` fields win; then the RPC `details` text; a plain (non-viem) message is
 * scanned last, because viem messages embed the request calldata.
 */
export function revertDataOf(error: unknown): Hex | undefined {
  const chain = causeChain(error)
  for (const e of chain) {
    const direct = hexData(e.data)
    if (direct) return direct
    if (e.data && typeof e.data === 'object') {
      const inner = e.data as { data?: unknown; revertData?: unknown }
      const nested = hexData(inner.revertData) ?? hexData(inner.data)
      if (nested) return nested
    }
  }
  for (const e of chain) {
    if (typeof e.details === 'string') {
      const match = e.details.match(/0x[0-9a-fA-F]{8,}/)
      if (match) return match[0] as Hex
    }
  }
  for (const e of chain) {
    if (typeof e.message === 'string' && !('shortMessage' in e)) {
      const match = e.message.match(/0x[0-9a-fA-F]{8,}/)
      if (match) return match[0] as Hex
    }
  }
  return undefined
}

export type SettleErrorKind =
  /** the intent itself cannot settle (venue, oracle, router); the other path would fail too */
  | 'intent'
  /** the paymaster or its policy refused; try the relayer */
  | 'sponsorship'
  /** the bundler, proxy or RPC failed before inclusion; try the relayer */
  | 'bundler'
  /** the account cannot use this path (no 7702 signer, foreign delegation) */
  | 'account'
  /** the relayer refused or failed */
  | 'relayer'
  /** server-side configuration is missing */
  | 'config'
  /** a userOp was sent but its receipt did not arrive in time; do not retry blindly */
  | 'pending'

export class SettleError extends Error {
  readonly kind: SettleErrorKind
  readonly path: GasPath | undefined
  readonly decoded: DecodedSettleError | undefined

  constructor(kind: SettleErrorKind, message: string, opts: { path?: GasPath; cause?: unknown; decoded?: DecodedSettleError } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause })
    this.name = 'SettleError'
    this.kind = kind
    this.path = opts.path
    this.decoded = opts.decoded
  }
}

/** Kinds after which the sponsored path may fall back to the relayer. */
export const FALLBACK_KINDS: ReadonlySet<SettleErrorKind> = new Set(['sponsorship', 'bundler', 'account'])

/** Decode a hex reason when the bundler hands one back on a soft-failed userOp. */
export function reasonFromReceipt(reason: string | undefined): DecodedSettleError | undefined {
  if (!reason) return undefined
  if (isHex(reason)) return decodeSettleError(reason)
  const embedded = reason.match(/0x[0-9a-fA-F]{8,}/)
  if (embedded) return decodeSettleError(embedded[0] as Hex)
  return { name: 'Reverted', message: reason, source: 'unknown', selector: '0x' }
}
