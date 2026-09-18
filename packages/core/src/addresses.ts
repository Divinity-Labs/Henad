import type { Address } from 'viem'
import { MONAD_MAINNET_ID, MONAD_TESTNET_ID, type MonadChainId } from './chains'

/**
 * Every address here is documented with its source and verification method in
 * docs/INTEGRATION-FACTS.md. Section numbers are given per entry. Do not add an
 * address without adding it there first.
 */

export interface TokenInfo {
  address: Address
  symbol: string
  decimals: number
}

export const TOKENS: Record<MonadChainId, Record<string, TokenInfo>> = {
  [MONAD_MAINNET_ID]: {
    // §1, §12.2 — Agora USD, verified proxy; decimals() read on-chain 2026-09-10
    AUSD: { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', symbol: 'AUSD', decimals: 6 },
    // §1 — native Circle USDC
    USDC: { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', symbol: 'USDC', decimals: 6 },
    // §2 — Mento StableTokenSpoke, decimals() read on-chain 2026-09-10
    USDm: { address: '0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115', symbol: 'USDm', decimals: 18 },
    GBPm: { address: '0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1', symbol: 'GBPm', decimals: 18 },
    // §2 — token list only; pools unverified
    EURm: { address: '0x4D502d735B4C574B487Ed641ae87cEaE884731C7', symbol: 'EURm', decimals: 18 },
    CHFm: { address: '0xF64e91fFEf7ef43aA314F0Bc2AC39f770797990C', symbol: 'CHFm', decimals: 18 },
    JPYm: { address: '0x22f6A6752800eAB67b84748FeFc3cC658384aF72', symbol: 'JPYm', decimals: 18 },
    WMON: { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON', decimals: 18 },
  },
  [MONAD_TESTNET_ID]: {
    // §12.2 — Agora testnet AUSD
    AUSD: { address: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', symbol: 'AUSD', decimals: 6 },
    // §1 — Circle testnet USDC
    USDC: { address: '0x534b2f3A21130d7a60830c2Df862319e593943A3', symbol: 'USDC', decimals: 6 },
    WMON: { address: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541', symbol: 'WMON', decimals: 18 },
  },
}

/** §2 — Mento V3 on Monad mainnet. Nothing on testnet is verified. */
export const MENTO_MAINNET = {
  router: '0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6',
  oracleAdapter: '0xa472fBBF4b890A54381977ac392BdF82EeC4383a',
  sortedOracles: '0x6f92C745346057a61b259579256159458a0a6A92',
  fpmmFactory: '0xa849b475FE5a4B5C9C3280152c7a1945b907613b',
  factoryRegistry: '0x7b2f7d11eabD576782f77bF2CcA46a853410AdF6',
  breakerBox: '0x9fc1E0d10fb38954Da385B8B25aB2BbaF3241722',
  marketHoursBreaker: '0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF',
  pools: {
    'AUSD/USDm': '0xb0a0264Ce6847F101b76ba36A4a3083ba489F501',
    'USDC/USDm': '0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5',
    'GBPm/USDm': '0xD0E9c1a718D2a693d41eacd4B2696180403Ce081',
    // §14.1 — all seven pools enumerated from FPMMFactory on 2026-09-10
    'EURm/USDm': '0x93e15A22fDa39FEfcCCe82D387A09cCF030EAD61',
    'CHFm/USDm': '0xDC81135fD82f02Cae736E261FB676B716663e8b8',
    'JPYm/USDm': '0x4DF3f08977743Ad95aB31b8dC203EAe885Ae9D32',
    'USDT0/USDm': '0x0A59be741AD49c6C2E0a2d30a57eD8f5ffa5DEB8',
  },
  /** §14.2 — per-pool oracle adapters differ; read pool.oracleAdapter() on-chain, these are for display only */
  oracleAdapterFx: '0xa472fBBF4b890A54381977ac392BdF82EeC4383a',
  oracleAdapterUsd: '0xEB23E1339b2119c0f4a0097Cb294E990C1fA6423',
} as const satisfies Record<string, Address | Record<string, Address>>

/** §4, §12.2 — Chainlink Data Feed proxies on Monad mainnet (AggregatorV3). */
export const CHAINLINK_MAINNET = {
  'GBP/USD': { address: '0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30', decimals: 18, heartbeatSec: 240 },
  'EUR/USD': { address: '0x00D7E359c8CE46168eFDD4D65b708fFb16c4b99a', decimals: 18, heartbeatSec: 240 },
  'CHF/USD': { address: '0x6DBa7f3A7B5B7c1079337104caD14D19150F6B8d', decimals: 18, heartbeatSec: 240 },
  'JPY/USD': { address: '0xF64664Ea54cE47eCC7a1816C49d1Bc6deF828927', decimals: 18, heartbeatSec: 240 },
  'AUSD/USD': { address: '0xE20751C7B5867bCBef815ffc1b284c3f412a9e13', decimals: 8, heartbeatSec: 3600 },
  // §14.3 — the 8-dec proxy is the one Mento relays; the 18-dec 0x30cF… is an SVR DualAggregator
  'USDC/USD': { address: '0xf5F15f188AbCB0d165D1Edb7f37F7d6fA2fCebec', decimals: 8, heartbeatSec: 3600 },
} as const satisfies Record<string, { address: Address; decimals: number; heartbeatSec: number }>

/** §1, §13 — canonical infrastructure on Monad mainnet. */
export const INFRA_MAINNET = {
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
  entryPointV07: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  entryPointV08: '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
  simple7702Account: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  // §14.4 — Pimlico SingletonPaymasterV8
  pimlicoPaymasterV08: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
  mentoMarketHoursBreaker: '0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF',
} as const satisfies Record<string, Address>

/** Henad's own contracts. Filled in by the deploy scripts; empty until then. */
export interface HenadDeployment {
  corridorRouter: Address
  rateAttestation: Address
  deployedAtBlock: bigint
}

/**
 * Deployed to Monad mainnet on 18 Sep 2026, block 105,928,848, and verified on Monadscan.
 * These addresses are permanent: the contracts have no upgrade path, so this is the registry
 * rather than an environment variable. A redeploy would be a new address and a new ledger.
 * Source of truth: contracts/deployments/143.json.
 */
export const HENAD: Partial<Record<MonadChainId, HenadDeployment>> = {
  [MONAD_MAINNET_ID]: {
    corridorRouter: '0x994e95FDb1713b1b12d3ccE47e2BC2145F43a0c9',
    rateAttestation: '0xCA9536F48Ac5C1673c7D7B20D4E76056Fc4fE3B1',
    deployedAtBlock: 105_928_848n,
  },
}
