import { encodeFunctionData, http, type Address, type Hex, type LocalAccount, type PublicClient, type SignedAuthorization } from 'viem'
import { toAccount } from 'viem/accounts'
import { createBundlerClient, WaitForUserOperationReceiptTimeoutError } from 'viem/account-abstraction'
import { to7702SimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { chainFor, corridorRouterAbi, erc20Abi, hashIntent, type Intent } from '@henad/core'
import { appChain } from '@/lib/chain'
import { DEFAULT_BUNDLER_URL, ENTRY_POINT_V08, SIMPLE_7702_ACCOUNT, absoluteUrl } from './config'
import { decodeSettleError, reasonFromReceipt, revertDataOf, SettleError } from './errors'
import type { SettleAccount, SettleOptions, SettleResult } from './types'

/**
 * PATH B — EIP-7702 delegation to Simple7702Account plus a Pimlico-sponsored
 * userOp on EntryPoint v0.8 (facts §13, §14.4).
 *
 * One userOp batches `approve(router, amount)` and `router.settle(intent)`, so
 * the router sees `msg.sender == intent.payer`. A first-use account attaches a
 * 7702 authorization signed with nonce = its transaction count; authorizations
 * are signed fresh every time and never cached. The payer holds no MON at any
 * point (the reserve rule permits this because the balance never decreases).
 */

/** Paymaster sponsorship is valid for 10 minutes, so the swap deadline must reach at least that far. */
export const SPONSORSHIP_MIN_DEADLINE_SEC = 10 * 60

/** Receipt polling budget: Monad finalises in 0.6 s; the bundler's inclusion loop is the slow part. */
const RECEIPT_TIMEOUT_MS = 90_000
const RECEIPT_POLL_MS = 1_000

/** Simple7702Account v0.8 batch entry point (eth-infinitism), guarded by msg.sender == entryPoint. */
export const executeBatchAbi = [
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const

export interface BatchCall {
  target: Address
  value: bigint
  data: Hex
}

/** The two calls, in order: approve the router, then settle. */
export function settleCalls(intent: Intent, router: Address): readonly [BatchCall, BatchCall] {
  return [
    {
      target: intent.sourceAsset,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, intent.sourceAmount] }),
    },
    {
      target: router,
      value: 0n,
      data: encodeFunctionData({ abi: corridorRouterAbi, functionName: 'settle', args: [intent] }),
    },
  ]
}

/** userOp callData: `executeBatch([approve, settle])`. */
export function encodeSettleBatch(intent: Intent, router: Address): Hex {
  return encodeFunctionData({ abi: executeBatchAbi, functionName: 'executeBatch', args: [settleCalls(intent, router)] })
}

/** EIP-7702 delegation designator: 0xef0100 ++ delegate. */
export function isDelegatedTo(code: Hex | undefined, delegate: Address): boolean {
  return !!code && code.toLowerCase() === `0xef0100${delegate.slice(2)}`.toLowerCase()
}

/** Map anything the bundler, paymaster or viem throws onto a SettleError the caller can act on. */
export function classify7702Error(error: unknown): SettleError {
  if (error instanceof SettleError) return error
  const data = revertDataOf(error)
  const decoded = data ? decodeSettleError(data) : undefined
  if (decoded && decoded.source !== 'unknown') {
    return new SettleError('intent', decoded.message, { path: 'eip7702', cause: error, decoded })
  }
  const text = messageChain(error)
  const summary = text.split('\n')[0]?.slice(0, 200) || 'unknown error'
  if (/sponsor|policy|paymaster|AA3\d/i.test(text)) {
    return new SettleError('sponsorship', `Sponsorship refused: ${summary}`, { path: 'eip7702', cause: error })
  }
  return new SettleError('bundler', `Bundler error: ${summary}`, { path: 'eip7702', cause: error })
}

function messageChain(error: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const e = current as { message?: unknown; details?: unknown; cause?: unknown }
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.details === 'string') parts.push(e.details)
    current = e.cause
  }
  return parts.join('\n')
}

/** Adapt the minimal SettleAccount to the LocalAccount permissionless expects; EP v0.8 signs typed data only. */
function ownerFor(account: SettleAccount): LocalAccount {
  return toAccount({
    address: account.address,
    signTypedData: (typedData) => account.signTypedData(typedData),
    signMessage: () => Promise.reject(new SettleError('account', 'Message signing is not part of settlement.', { path: 'eip7702' })),
    signTransaction: () => Promise.reject(new SettleError('account', 'The payer never signs a transaction on this path.', { path: 'eip7702' })),
  })
}

/** Sign a fresh delegation for a first-use account, or verify an existing one. Never cached. */
async function authorizationFor(
  account: SettleAccount,
  client: PublicClient,
  chainId: number,
): Promise<SignedAuthorization | undefined> {
  const code = await client.getCode({ address: account.address })
  if (code && code !== '0x') {
    if (isDelegatedTo(code, SIMPLE_7702_ACCOUNT)) return undefined
    throw new SettleError('account', 'This account is delegated to another contract; use the relayer path.', { path: 'eip7702' })
  }
  if (!account.signAuthorization) {
    throw new SettleError('account', 'This account cannot sign an EIP-7702 authorization.', { path: 'eip7702' })
  }
  const nonce = await client.getTransactionCount({ address: account.address })
  return account.signAuthorization({ address: SIMPLE_7702_ACCOUNT, chainId, nonce })
}

/** Build, sponsor, send and confirm the userOp. Resolves with the inclusion tx hash. */
export async function settleViaEip7702(
  intent: Intent,
  account: SettleAccount,
  opts: Pick<SettleOptions, 'chainId' | 'router' | 'bundlerUrl' | 'client'>,
): Promise<SettleResult> {
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  if (intent.deadline < nowSec + BigInt(SPONSORSHIP_MIN_DEADLINE_SEC)) {
    throw new SettleError('sponsorship', 'Sponsored settlement needs a deadline at least 10 minutes out.', { path: 'eip7702' })
  }

  const intentId = hashIntent(intent, opts.chainId, opts.router)
  const chain = chainFor(opts.chainId)
  const client = opts.client ?? appChain()
  const bundlerUrl = absoluteUrl(opts.bundlerUrl ?? DEFAULT_BUNDLER_URL)

  const authorization = await authorizationFor(account, client, opts.chainId)

  const smartAccount = await to7702SimpleSmartAccount({
    client,
    owner: ownerFor(account),
    entryPoint: { address: ENTRY_POINT_V08, version: '0.8' },
    accountLogicAddress: SIMPLE_7702_ACCOUNT,
  })

  const pimlico = createPimlicoClient({
    chain,
    transport: http(bundlerUrl),
    entryPoint: { address: ENTRY_POINT_V08, version: '0.8' },
  })

  const bundler = createBundlerClient({
    account: smartAccount,
    chain,
    client,
    transport: http(bundlerUrl),
    paymaster: pimlico,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast,
    },
  })

  let hash: Hex
  try {
    hash = await bundler.sendUserOperation({
      callData: encodeSettleBatch(intent, opts.router),
      ...(authorization ? { authorization } : {}),
    })
  } catch (error) {
    throw classify7702Error(error)
  }

  let receipt
  try {
    receipt = await bundler.waitForUserOperationReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS, pollingInterval: RECEIPT_POLL_MS })
  } catch (error) {
    if (error instanceof WaitForUserOperationReceiptTimeoutError) {
      throw new SettleError('pending', `User operation ${hash} was sent but no receipt arrived within ${RECEIPT_TIMEOUT_MS / 1000} s.`, {
        path: 'eip7702',
        cause: error,
      })
    }
    throw classify7702Error(error)
  }

  // facts §14.4 — an inner revert is a soft failure: the tx succeeds, UserOperationEvent.success is false.
  if (!receipt.success) {
    const decoded = reasonFromReceipt(receipt.reason)
    throw new SettleError('intent', decoded?.message ?? 'The settlement reverted inside the user operation.', { path: 'eip7702', decoded })
  }

  return { intentId, txHash: receipt.receipt.transactionHash, path: 'eip7702' }
}
