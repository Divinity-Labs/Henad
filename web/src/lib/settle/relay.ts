import { getAddress, isAddress, isHex, size, type Address, type Hex } from 'viem'
import { TOKENS, type Intent, type MonadChainId } from '@henad/core'
import { fromWire, type IntentWire } from './types'

/**
 * Pure helpers behind /api/relay and /api/bundler. Nothing here touches the
 * network, so every rule is unit-tested without a chain.
 */

/** The relayer will not hold an authorization open longer than this (deadline - now). */
export const RELAY_MAX_DEADLINE_SEC = 30 * 60

/** facts §14.5 — Monad bills the gas limit, so the limit is policy, not a guess. */
export const GAS_HEADROOM_PERCENT = 10n
export const GAS_LIMIT_FLOOR = 1_400_000n
export const GAS_LIMIT_CAP = 1_600_000n

/** ceil(estimate × 1.10), clamped to [1.4M, 1.6M]. */
export function gasLimitFor(estimate: bigint): bigint {
  const withHeadroom = (estimate * (100n + GAS_HEADROOM_PERCENT) + 99n) / 100n
  if (withHeadroom < GAS_LIMIT_FLOOR) return GAS_LIMIT_FLOOR
  if (withHeadroom > GAS_LIMIT_CAP) return GAS_LIMIT_CAP
  return withHeadroom
}

/** Source assets the relayer will pull: AUSD and USDC of the configured chain (facts §13.3). */
export function relayableAssets(chainId: MonadChainId): Address[] {
  const tokens = TOKENS[chainId]
  return [tokens.AUSD, tokens.USDC].flatMap((t) => (t ? [t.address] : []))
}

export type ParsedRelayBody =
  | { ok: true; intent: Intent; signature: Hex }
  | { ok: false; status: number; error: string }

const UINT_RE = /^(0|[1-9]\d*)$/
const BPS_MAX = 10_000

function reject(error: string): ParsedRelayBody {
  return { ok: false, status: 400, error }
}

type Field<T> = { ok: true; value: T } | { ok: false; error: string }

function readAddress(value: unknown, field: string): Field<Address> {
  return typeof value === 'string' && isAddress(value) ? { ok: true, value: getAddress(value) } : { ok: false, error: `${field} must be an address` }
}

function readUint(value: unknown, field: string, max: bigint): Field<bigint> {
  if (typeof value !== 'string' || !UINT_RE.test(value)) return { ok: false, error: `${field} must be a decimal string` }
  const n = BigInt(value)
  return n > max ? { ok: false, error: `${field} exceeds its range` } : { ok: true, value: n }
}

function readBps(value: unknown, field: string): Field<number> {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= BPS_MAX
    ? { ok: true, value }
    : { ok: false, error: `${field} must be an integer 0..${BPS_MAX}` }
}

const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n

/** Hand-written validation of the /api/relay body. Amounts arrive as decimal strings. */
export function parseRelayBody(body: unknown, ctx: { chainId: MonadChainId; nowSec: number }): ParsedRelayBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('Body must be a JSON object')
  const b = body as { chainId?: unknown; intent?: unknown; signature?: unknown }
  if (b.chainId !== undefined && b.chainId !== ctx.chainId) return reject(`chainId must be ${ctx.chainId}`)
  if (!b.intent || typeof b.intent !== 'object') return reject('intent is required')
  if (typeof b.signature !== 'string' || !isHex(b.signature) || size(b.signature) < 64 || size(b.signature) > 65 + 64) {
    return reject('signature must be a hex ECDSA or ERC-1271 signature')
  }
  const w = b.intent as Partial<Record<keyof IntentWire, unknown>>

  const payer = readAddress(w.payer, 'payer')
  if (!payer.ok) return reject(payer.error)
  const recipient = readAddress(w.recipient, 'recipient')
  if (!recipient.ok) return reject(recipient.error)
  const sourceAsset = readAddress(w.sourceAsset, 'sourceAsset')
  if (!sourceAsset.ok) return reject(sourceAsset.error)
  const targetAsset = readAddress(w.targetAsset, 'targetAsset')
  if (!targetAsset.ok) return reject(targetAsset.error)

  const sourceAmount = readUint(w.sourceAmount, 'sourceAmount', UINT256_MAX)
  if (!sourceAmount.ok) return reject(sourceAmount.error)
  if (sourceAmount.value === 0n) return reject('sourceAmount must be positive')
  const quotedAmountOut = readUint(w.quotedAmountOut, 'quotedAmountOut', UINT256_MAX)
  if (!quotedAmountOut.ok) return reject(quotedAmountOut.error)
  const deadline = readUint(w.deadline, 'deadline', UINT64_MAX)
  if (!deadline.ok) return reject(deadline.error)
  const toleranceBps = readBps(w.toleranceBps, 'toleranceBps')
  if (!toleranceBps.ok) return reject(toleranceBps.error)
  const maxSpreadBps = readBps(w.maxSpreadBps, 'maxSpreadBps')
  if (!maxSpreadBps.ok) return reject(maxSpreadBps.error)
  if (typeof w.salt !== 'string' || !isHex(w.salt) || size(w.salt) !== 32) return reject('salt must be 32 bytes of hex')

  const allowed = relayableAssets(ctx.chainId).map((a) => a.toLowerCase())
  if (!allowed.includes(sourceAsset.value.toLowerCase())) return reject('source asset must be AUSD or USDC on this chain')

  const now = BigInt(ctx.nowSec)
  if (deadline.value <= now) return reject('deadline has already passed')
  if (deadline.value > now + BigInt(RELAY_MAX_DEADLINE_SEC)) {
    return reject(`deadline must be within ${RELAY_MAX_DEADLINE_SEC / 60} minutes`)
  }

  const intent = fromWire({
    payer: payer.value,
    recipient: recipient.value,
    sourceAsset: sourceAsset.value,
    targetAsset: targetAsset.value,
    sourceAmount: sourceAmount.value.toString(),
    quotedAmountOut: quotedAmountOut.value.toString(),
    toleranceBps: toleranceBps.value,
    maxSpreadBps: maxSpreadBps.value,
    deadline: deadline.value.toString(),
    salt: w.salt,
  })
  return { ok: true, intent, signature: b.signature }
}

/** Fixed-window counter per key, in process memory. Enough for one relayer instance. */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key)
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 })
      if (this.hits.size > 10_000) this.sweep(now)
      return true
    }
    if (entry.count >= this.limit) return false
    entry.count += 1
    return true
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key)
    }
  }
}

/** Best-effort client address behind a proxy; falls back to one shared bucket. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

// ---- /api/bundler --------------------------------------------------------

/** JSON-RPC methods the proxy will forward to Pimlico (facts §14.4). */
export const BUNDLER_METHODS: ReadonlySet<string> = new Set([
  'eth_estimateUserOperationGas',
  'eth_sendUserOperation',
  'eth_getUserOperationReceipt',
  'pm_getPaymasterStubData',
  'pm_getPaymasterData',
  'pm_sponsorUserOperation',
  'eth_supportedEntryPoints',
  'pimlico_getUserOperationGasPrice',
])

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown[]
}

export type PreparedBundlerRequest =
  | { ok: true; payload: JsonRpcRequest | JsonRpcRequest[] }
  | { ok: false; status: number; error: string; id: number | string | null }

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<JsonRpcRequest>
  return v.jsonrpc === '2.0' && typeof v.method === 'string' && (v.params === undefined || Array.isArray(v.params))
}

/** Where each paymaster method carries its context object (ERC-7677 and Pimlico's own shape). */
const CONTEXT_INDEX: Record<string, number> = {
  pm_getPaymasterStubData: 3,
  pm_getPaymasterData: 3,
  pm_sponsorUserOperation: 2,
}

function withPolicy(request: JsonRpcRequest, policyId: string | undefined): JsonRpcRequest {
  const index = CONTEXT_INDEX[request.method]
  if (index === undefined || !policyId) return request
  const params = [...(request.params ?? [])]
  while (params.length < index) params.push(undefined)
  const existing = params[index]
  params[index] = { ...(existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {}), sponsorshipPolicyId: policyId }
  return { ...request, params }
}

/** Validate a single or batched JSON-RPC body, allow-list methods and stamp the sponsorship policy. */
export function prepareBundlerRequest(body: unknown, policyId: string | undefined): PreparedBundlerRequest {
  const list = Array.isArray(body) ? body : [body]
  if (list.length === 0 || list.length > 20) return { ok: false, status: 400, error: 'Batch must hold 1 to 20 requests', id: null }
  const prepared: JsonRpcRequest[] = []
  for (const item of list) {
    if (!isJsonRpcRequest(item)) return { ok: false, status: 400, error: 'Body must be a JSON-RPC 2.0 request', id: null }
    if (!BUNDLER_METHODS.has(item.method)) {
      return { ok: false, status: 403, error: `Method ${item.method} is not allowed through this proxy`, id: item.id ?? null }
    }
    prepared.push(withPolicy({ ...item, id: item.id ?? null }, policyId))
  }
  return { ok: true, payload: Array.isArray(body) ? prepared : prepared[0]! }
}
