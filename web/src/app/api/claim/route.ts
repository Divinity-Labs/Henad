import { BaseError, ContractFunctionRevertedError, createWalletClient, encodeFunctionData, fallback, http, isAddress, isHex, getAddress, size, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MAINNET_RPCS, MONAD_MAINNET_ID, chainFor, claimEscrow, claimEscrowAbi, claimToken, readLink } from '@henad/core'
import { appChain, appChainId } from '@/lib/chain'
import { RateLimiter, clientIp } from '@/lib/settle/relay'

/**
 * Submits claim-link transactions and pays their gas, the way /api/relay does for payouts:
 *   fund   — the sender's ERC-3009 authorization plus the link key's Fund signature
 *   claim  — the link key's Claim(claimSigner, recipient)
 *   cancel — the sender's Cancel(claimSigner, deadline)
 *   refund — nothing signed; an expired deposit can only go back to its sender
 *
 * Every signature is checked by ClaimEscrow, not here, so this route can move no money that
 * was not signed for. What it does check is the token: the escrow takes any token, and a
 * token written for the purpose could fake a deposit, so the relayer pays gas only for
 * AUSD and USDC. Every call is simulated first, because Monad bills the gas limit even for
 * a revert.
 *
 * RELAYER_PRIVATE_KEY is read per request and never logged or echoed.
 */

const limiter = new RateLimiter(6, 60_000)

/** A deposit by authorization is the heaviest at about 150k; nothing here should need more. */
const CLAIM_GAS_CAP = 400_000n

const MAX_AUTH_SEC = 30 * 60
const MAX_EXPIRY_SEC = 90 * 24 * 60 * 60
const UINT_RE = /^(0|[1-9]\d*)$/

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

function relayerKey(): Hex | null {
  const raw = process.env.RELAYER_PRIVATE_KEY?.trim()
  return raw && isHex(raw) && raw.length === 66 ? raw : null
}

function rpcUrls(): string[] {
  const custom = process.env.NEXT_PUBLIC_MONAD_RPC_URL
  return custom ? [custom, ...MAINNET_RPCS] : [...MAINNET_RPCS]
}

function addr(v: unknown): Address | null {
  return typeof v === 'string' && isAddress(v) ? getAddress(v) : null
}

function uint(v: unknown): bigint | null {
  return typeof v === 'string' && UINT_RE.test(v) && v.length <= 78 ? BigInt(v) : null
}

function sig(v: unknown): Hex | null {
  return typeof v === 'string' && isHex(v) && size(v) >= 64 && size(v) <= 65 + 64 ? v : null
}

/** The escrow's own revert, in words, or null when the failure was the network. */
function revertReason(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (!(reverted instanceof ContractFunctionRevertedError)) return null
  switch (reverted.data?.errorName) {
    case 'NoDeposit':
      return 'There is no money behind this link any more.'
    case 'DepositExpired':
      return 'This link has expired. The money goes back to the sender.'
    case 'ClaimSignerUsed':
      return 'That link was already used. Make a new one.'
    case 'AuthorizationUsed':
    case 'InvalidExpiry':
    case 'SignatureExpired':
      return 'That took too long. Try again.'
    case 'InvalidSignature':
      return 'The signature did not match. Try again.'
    case 'NotExpired':
      return 'This link has not expired yet.'
    default:
      return 'That did not go through. Try again.'
  }
}

type Call = { functionName: 'depositWithAuthorization' | 'claim' | 'cancelWithSig' | 'refund'; args: readonly unknown[] }

/** The body, as the escrow call it asks for, or the reason it cannot be one. */
async function toCall(body: Record<string, unknown>): Promise<Call | string> {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const claimSigner = addr(body.claimSigner)
  if (!claimSigner) return 'That request was incomplete.'

  if (body.action === 'fund') {
    const token = addr(body.token)
    const from = addr(body.from)
    const amount = uint(body.amount)
    const expiry = uint(body.expiry)
    const validBefore = uint(body.validBefore)
    const salt = typeof body.salt === 'string' && isHex(body.salt) && size(body.salt) === 32 ? body.salt : null
    const signature = sig(body.signature)
    const fundSignature = sig(body.fundSignature)
    if (!token || !from || !amount || !expiry || !validBefore || !salt || !signature || !fundSignature) return 'That request was incomplete.'
    if (!claimToken(token)) return 'Links can only hold AUSD or USDC.'
    if (validBefore <= now || validBefore > now + BigInt(MAX_AUTH_SEC)) return 'That took too long. Try again.'
    if (expiry <= now || expiry > now + BigInt(MAX_EXPIRY_SEC)) return 'That link would expire at the wrong time. Try again.'
    return { functionName: 'depositWithAuthorization', args: [token, from, amount, claimSigner, expiry, validBefore, salt, signature, fundSignature] }
  }

  // Everything else acts on a deposit that already exists: only spend gas on one in AUSD or USDC.
  const link = await readLink(appChain(), claimSigner, now)
  if (link.kind === 'foreign') return 'Henad does not handle this link.'
  if (link.kind === 'done' || link.kind === 'none') return 'There is no money behind this link any more.'

  if (body.action === 'claim') {
    const recipient = addr(body.recipient)
    const signature = sig(body.signature)
    if (!recipient || !signature) return 'That request was incomplete.'
    if (link.kind === 'expired') return 'This link has expired. The money goes back to the sender.'
    return { functionName: 'claim', args: [claimSigner, recipient, signature] }
  }
  if (body.action === 'cancel') {
    const deadline = uint(body.deadline)
    const signature = sig(body.signature)
    if (deadline === null || !signature) return 'That request was incomplete.'
    if (deadline < now || deadline > now + BigInt(MAX_AUTH_SEC)) return 'That took too long. Try again.'
    if (link.kind === 'expired') return { functionName: 'refund', args: [claimSigner] }
    return { functionName: 'cancelWithSig', args: [claimSigner, deadline, signature] }
  }
  if (body.action === 'refund') {
    if (link.kind !== 'expired') return 'This link has not expired yet.'
    return { functionName: 'refund', args: [claimSigner] }
  }
  return 'That request was incomplete.'
}

export async function POST(request: Request): Promise<Response> {
  if (!limiter.allow(clientIp(request.headers))) return fail(429, 'Too many tries. Wait a minute and try again.')
  if (appChainId() !== MONAD_MAINNET_ID) return fail(503, 'Claim links only exist on Monad mainnet.')
  const key = relayerKey()
  if (!key) return fail(503, 'Claim links are not available on this deployment right now.')

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return fail(400, 'That request was incomplete.')

  let call: Call | string
  try {
    call = await toCall(body)
  } catch (error) {
    console.error('[claim] read failed', error instanceof Error ? error.message.split('\n')[0] : String(error))
    return fail(502, 'Could not reach the network. Try again.')
  }
  if (typeof call === 'string') return fail(422, call)

  const relayer = privateKeyToAccount(key)
  const client = appChain()
  const escrow = claimEscrow()
  const abi = claimEscrowAbi

  try {
    await client.simulateContract({ account: relayer.address, address: escrow, abi, functionName: call.functionName, args: call.args } as never)
  } catch (error) {
    const reason = revertReason(error)
    if (reason) return fail(422, reason)
    console.error('[claim] pre-flight failed', error instanceof Error ? error.message.split('\n')[0] : String(error))
    return fail(502, 'Could not reach the network. Try again.')
  }

  const data = encodeFunctionData({ abi, functionName: call.functionName, args: call.args } as never)
  try {
    // Not gasLimitFor: its 1.4M floor is sized for a payout, and Monad bills the whole limit.
    const estimate = await client.estimateGas({ account: relayer.address, to: escrow, data })
    const gas = (estimate * 120n) / 100n
    if (gas > CLAIM_GAS_CAP) return fail(502, 'That did not go through just now. Try again.')
    const wallet = createWalletClient({ account: relayer, chain: chainFor(MONAD_MAINNET_ID), transport: fallback(rpcUrls().map((url) => http(url))) })
    const txHash = await wallet.sendTransaction({ to: escrow, data, gas })
    return Response.json({ txHash })
  } catch (error) {
    console.error('[claim] send failed', error instanceof Error ? error.message.split('\n')[0] : String(error))
    return fail(502, 'That did not go through just now. Try again.')
  }
}
