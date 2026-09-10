import type { Address, AuthorizationRequest, Hex, PublicClient, SignedAuthorization, TypedData, TypedDataDefinition } from 'viem'
import type { Intent, MonadChainId } from '@henad/core'

/** Which rail carried the settlement (docs/INTEGRATION-FACTS.md §13.5). */
export type GasPath = 'erc3009' | 'eip7702'

/**
 * The least an account must do for either path. A viem `LocalAccount` satisfies
 * it, so Mera's `toViemAccount(session)` can be passed straight in; an account
 * without `signAuthorization` can only use the relayer path.
 */
export interface SettleAccount {
  address: Address
  /** Same generic shape as viem's LocalAccount.signTypedData, so the two are interchangeable. */
  signTypedData<const typedData extends TypedData | Record<string, unknown>, primaryType extends keyof typedData | 'EIP712Domain' = keyof typedData>(
    typedData: TypedDataDefinition<typedData, primaryType>,
  ): Promise<Hex>
  signAuthorization?(authorization: AuthorizationRequest): Promise<SignedAuthorization>
}

export interface SettleResult {
  intentId: Hex
  txHash: Hex
  path: GasPath
}

export interface SettleOptions {
  chainId: MonadChainId
  /** CorridorRouter the intent was quoted against; also the EIP-712 verifying contract. */
  router: Address
  /** 'auto' (default) follows NEXT_PUBLIC_GAS_PATH and the account's abilities. */
  path?: 'auto' | GasPath
  /** Relayer endpoint for the ERC-3009 path. Defaults to /api/relay. */
  relayUrl?: string
  /** Bundler proxy for the EIP-7702 path. Defaults to /api/bundler. */
  bundlerUrl?: string
  /** Chain reads for the EIP-7702 path (code, nonce). Defaults to the app chain client. */
  client?: PublicClient
}

/** Intent as it crosses the wire to /api/relay: uint256 fields as decimal strings. */
export interface IntentWire {
  payer: Address
  recipient: Address
  sourceAsset: Address
  targetAsset: Address
  sourceAmount: string
  quotedAmountOut: string
  toleranceBps: number
  maxSpreadBps: number
  deadline: string
  salt: Hex
}

export interface RelayRequest {
  chainId: number
  intent: IntentWire
  signature: Hex
}

export interface RelayResponse {
  intentId: Hex
  txHash: Hex
}

/** Error body the relayer returns; `code` maps onto SettleError kinds on the client. */
export interface RelayErrorResponse {
  error: string
  code: 'bad_request' | 'rate_limit' | 'config' | 'intent' | 'relayer'
  reason?: { name: string; source: string }
}

export function toWire(intent: Intent): IntentWire {
  return {
    payer: intent.payer,
    recipient: intent.recipient,
    sourceAsset: intent.sourceAsset,
    targetAsset: intent.targetAsset,
    sourceAmount: intent.sourceAmount.toString(),
    quotedAmountOut: intent.quotedAmountOut.toString(),
    toleranceBps: intent.toleranceBps,
    maxSpreadBps: intent.maxSpreadBps,
    deadline: intent.deadline.toString(),
    salt: intent.salt,
  }
}

export function fromWire(wire: IntentWire): Intent {
  return {
    payer: wire.payer,
    recipient: wire.recipient,
    sourceAsset: wire.sourceAsset,
    targetAsset: wire.targetAsset,
    sourceAmount: BigInt(wire.sourceAmount),
    quotedAmountOut: BigInt(wire.quotedAmountOut),
    toleranceBps: wire.toleranceBps,
    maxSpreadBps: wire.maxSpreadBps,
    deadline: BigInt(wire.deadline),
    salt: wire.salt,
  }
}
