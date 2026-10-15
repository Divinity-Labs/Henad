import { BaseError, ContractFunctionRevertedError, createWalletClient, encodeFunctionData, fallback, http, isAddress, isHex, getAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MAINNET_RPCS, MONAD_MAINNET_ID, chainFor, handleRegistry, handleRegistryAbi, toHandle } from '@henad/core'
import { appChain, appChainId } from '@/lib/chain'
import { RateLimiter, clientIp } from '@/lib/settle/relay'

/**
 * Claims a Henad name for a passkey account and pays the gas, the way /api/relay pays for a
 * payout. The account signs Register(owner, handle, nonce, deadline) under HandleRegistry's
 * domain; this route only submits it, so it can claim nothing the owner did not sign.
 *
 * Simulated first, because Monad bills the gas limit even for a revert, and the simulated
 * return value says whether the name was free: registerFor returns false rather than
 * reverting when someone else holds it.
 *
 * RELAYER_PRIVATE_KEY is read per request and never logged or echoed.
 */

// Tighter than payouts: a name costs the relayer gas and earns nothing, and one account only
// ever needs one or two.
const limiter = new RateLimiter(3, 60_000)

/** No registration costs more; anything above it is not one and is not paid for. */
const HANDLE_GAS_CAP = 300_000n

/** Signed requests stay usable for at most this long. */
const MAX_DEADLINE_SEC = 15 * 60

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

/** The registry's own revert, in words, or null when the failure was the network. */
function revertReason(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (!(reverted instanceof ContractFunctionRevertedError)) return null
  switch (reverted.data?.errorName) {
    case 'InvalidHandle':
      return 'That name has characters a Henad name cannot use.'
    case 'SignatureExpired':
      return 'That took too long. Try again.'
    case 'InvalidSignature':
      return 'Your passkey signature did not match this account. Sign in again and retry.'
    default:
      return 'The name could not be claimed. Try again.'
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!limiter.allow(clientIp(request.headers))) return fail(429, 'Too many tries. Wait a minute and try again.')
  if (appChainId() !== MONAD_MAINNET_ID) return fail(503, 'Henad names only exist on Monad mainnet.')
  const key = relayerKey()
  if (!key) return fail(503, 'Names are not available on this deployment right now.')

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const owner = typeof body?.owner === 'string' && isAddress(body.owner) ? getAddress(body.owner) : null
  const handle = typeof body?.handle === 'string' ? toHandle(body.handle) : null
  const signature = typeof body?.signature === 'string' && isHex(body.signature) ? body.signature : null
  const deadline = typeof body?.deadline === 'string' && /^\d+$/.test(body.deadline) ? BigInt(body.deadline) : null
  if (!owner || !handle || !signature || deadline === null) return fail(400, 'That request was incomplete.')
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (deadline < now || deadline > now + BigInt(MAX_DEADLINE_SEC)) return fail(400, 'That took too long. Try again.')

  const relayer = privateKeyToAccount(key)
  const client = appChain()
  const registry = handleRegistry()
  const args = [owner, handle, deadline, signature] as const

  let free: boolean
  try {
    const { result } = await client.simulateContract({ account: relayer.address, address: registry, abi: handleRegistryAbi, functionName: 'registerFor', args })
    free = result
  } catch (error) {
    const reason = revertReason(error)
    if (reason) return fail(422, reason)
    console.error('[handle] pre-flight failed', error instanceof Error ? error.message.split('\n')[0] : String(error))
    return fail(502, 'Could not reach the network. Try again.')
  }
  // Submitting anyway would spend the signature for nothing; say so now instead.
  if (!free) return fail(409, `@${handle} is taken. Try another.`)

  const data = encodeFunctionData({ abi: handleRegistryAbi, functionName: 'registerFor', args })
  try {
    // Not gasLimitFor: its 1.4M floor is sized for a payout, and Monad bills the whole limit.
    // A registration is about 100k; a fifth on top covers a longer name than estimated.
    const estimate = await client.estimateGas({ account: relayer.address, to: registry, data })
    const gas = (estimate * 120n) / 100n
    if (gas > HANDLE_GAS_CAP) return fail(502, 'The name could not be claimed just now. Try again.')
    const wallet = createWalletClient({ account: relayer, chain: chainFor(MONAD_MAINNET_ID), transport: fallback(rpcUrls().map((url) => http(url))) })
    const txHash = await wallet.sendTransaction({ to: registry, data, gas })
    return Response.json({ handle, txHash })
  } catch (error) {
    console.error('[handle] send failed', error instanceof Error ? error.message.split('\n')[0] : String(error))
    return fail(502, 'The name could not be claimed just now. Try again.')
  }
}
