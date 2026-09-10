import { MONAD_MAINNET_ID, type MonadChainId } from './chains'

/**
 * A WebAuthn passkey is bound forever to the relying-party id it was created
 * under (docs/INTEGRATION-FACTS.md §12.1, docs/PLAN.md "Domains and passkeys").
 * Real-value accounts must therefore only ever be created under the production
 * domain. This guard makes a misconfigured mainnet deploy fail at startup instead
 * of minting accounts on the wrong domain.
 */
export const PRODUCTION_RP_ID = 'henad.xyz'

export class RpIdMismatchError extends Error {
  constructor(chainId: number, rpId: string) {
    super(
      `Refusing to build a client for chain ${chainId} with rpId "${rpId}". ` +
        `Mainnet passkeys may only be created under "${PRODUCTION_RP_ID}".`,
    )
    this.name = 'RpIdMismatchError'
  }
}

export function assertRpIdForChain(chainId: MonadChainId, rpId: string): void {
  if (chainId === MONAD_MAINNET_ID && rpId !== PRODUCTION_RP_ID) {
    throw new RpIdMismatchError(chainId, rpId)
  }
}
