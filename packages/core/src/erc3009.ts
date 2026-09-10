import type { Address, Hex, TypedDataDomain } from 'viem'
import { MONAD_MAINNET_ID, MONAD_TESTNET_ID, type MonadChainId } from './chains'
import { TOKENS } from './addresses'

/**
 * ERC-3009 typed data for the relayer path (docs/INTEGRATION-FACTS.md §14.4).
 * The payer signs ReceiveWithAuthorization with `to` = CorridorRouter and
 * `nonce` = intentId; the router recomputes the intentId from the intent it is
 * given, so the one signature binds every field of the intent.
 *
 * Domains were read on-chain: AUSD ("Agora Dollar", "1"), USDC ("USDC", "2").
 * `validAfter` must be 0 (tokens require block.timestamp > validAfter strictly).
 */

export interface TokenDomain {
  name: string
  version: string
}

const DOMAINS: Record<MonadChainId, Record<string, TokenDomain>> = {
  [MONAD_MAINNET_ID]: {
    [TOKENS[MONAD_MAINNET_ID].AUSD!.address.toLowerCase()]: { name: 'Agora Dollar', version: '1' },
    [TOKENS[MONAD_MAINNET_ID].USDC!.address.toLowerCase()]: { name: 'USDC', version: '2' },
  },
  [MONAD_TESTNET_ID]: {
    // Testnet AUSD/USDC domains are UNVERIFIED; the client must read eip712Domain()/
    // DOMAIN_SEPARATOR() on-chain and compare before signing (see checkDomainSeparator).
    [TOKENS[MONAD_TESTNET_ID].AUSD!.address.toLowerCase()]: { name: 'Agora Dollar', version: '1' },
    [TOKENS[MONAD_TESTNET_ID].USDC!.address.toLowerCase()]: { name: 'USDC', version: '2' },
  },
}

export function tokenDomain(chainId: MonadChainId, token: Address): TypedDataDomain {
  const d = DOMAINS[chainId][token.toLowerCase()]
  if (!d) throw new Error(`No ERC-3009 domain known for ${token} on chain ${chainId}`)
  return { name: d.name, version: d.version, chainId, verifyingContract: token }
}

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export const CANCEL_AUTHORIZATION_TYPES = {
  CancelAuthorization: [
    { name: 'authorizer', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export interface ReceiveAuthorization {
  from: Address
  to: Address
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: Hex
}

/** Typed data the payer signs so the router can pull `value` of `token` once. */
export function receiveWithAuthorizationTypedData(
  chainId: MonadChainId,
  token: Address,
  auth: ReceiveAuthorization,
) {
  if (auth.validAfter !== 0n) throw new Error('validAfter must be 0 (strict > check on-chain)')
  return {
    domain: tokenDomain(chainId, token),
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: 'ReceiveWithAuthorization' as const,
    message: auth,
  }
}

/** Typed data the payer signs to void an unrelayed authorization at the token. */
export function cancelAuthorizationTypedData(chainId: MonadChainId, token: Address, authorizer: Address, nonce: Hex) {
  return {
    domain: tokenDomain(chainId, token),
    types: CANCEL_AUTHORIZATION_TYPES,
    primaryType: 'CancelAuthorization' as const,
    message: { authorizer, nonce },
  }
}
