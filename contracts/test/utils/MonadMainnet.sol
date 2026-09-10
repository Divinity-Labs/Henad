// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title MonadMainnet
/// @notice Verified Monad mainnet (143) addresses for tests. Every entry is
///         documented with its source in docs/INTEGRATION-FACTS.md (section given).
///         Do not add an address here without adding it there.
library MonadMainnet {
    uint256 internal constant CHAIN_ID = 143;

    // §1, §12.2 tokens
    address internal constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a; // 6 dec
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603; // 6 dec
    address internal constant USDM = 0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115; // 18 dec
    address internal constant GBPM = 0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1; // 18 dec
    address internal constant EURM = 0x4D502d735B4C574B487Ed641ae87cEaE884731C7; // 18 dec
    address internal constant CHFM = 0xF64e91fFEf7ef43aA314F0Bc2AC39f770797990C; // 18 dec
    address internal constant JPYM = 0x22f6A6752800eAB67b84748FeFc3cC658384aF72; // 18 dec

    // §2, §14.1 Mento V3
    address internal constant MENTO_ROUTER = 0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6;
    address internal constant MENTO_FPMM_FACTORY = 0xa849b475FE5a4B5C9C3280152c7a1945b907613b;
    address internal constant MENTO_RESERVE_V2 = 0x4255Cf38e51516766180b33122029A88Cb853806; // holds ~686k AUSD
    address internal constant POOL_AUSD_USDM = 0xb0a0264Ce6847F101b76ba36A4a3083ba489F501;
    address internal constant POOL_USDC_USDM = 0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5;
    address internal constant POOL_GBPM_USDM = 0xD0E9c1a718D2a693d41eacd4B2696180403Ce081;
    address internal constant POOL_EURM_USDM = 0x93e15A22fDa39FEfcCCe82D387A09cCF030EAD61;
    address internal constant POOL_CHFM_USDM = 0xDC81135fD82f02Cae736E261FB676B716663e8b8;
    address internal constant POOL_JPYM_USDM = 0x4DF3f08977743Ad95aB31b8dC203EAe885Ae9D32;

    // §14.2 oracle layer (per-pool adapters; read pool.oracleAdapter() in code)
    address internal constant ORACLE_ADAPTER_FX = 0xa472fBBF4b890A54381977ac392BdF82EeC4383a; // GBPm/EURm/CHFm/JPYm pools
    address internal constant ORACLE_ADAPTER_USD = 0xEB23E1339b2119c0f4a0097Cb294E990C1fA6423; // AUSD/USDC/USDT0 pools
    address internal constant MARKET_HOURS_BREAKER = 0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF;
    address internal constant RATE_FEED_GBP_USD = 0xEA4103A6A122fbe2cDb07A80d4d293be07bb29Fa; // keccak("GBP/USD")
    address internal constant RATE_FEED_AUSD_USD = 0xf47172cE00522Cc7dB02109634A92CE866a15FCC;

    // §4, §14.3 Chainlink proxies
    address internal constant CL_GBP_USD = 0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30; // 18 dec, 240 s heartbeat
    address internal constant CL_EUR_USD = 0x00D7E359c8CE46168eFDD4D65b708fFb16c4b99a; // 18 dec
    address internal constant CL_CHF_USD = 0x6DBa7f3A7B5B7c1079337104caD14D19150F6B8d; // 18 dec
    address internal constant CL_JPY_USD = 0xF64664Ea54cE47eCC7a1816C49d1Bc6deF828927; // 18 dec
    address internal constant CL_AUSD_USD = 0xE20751C7B5867bCBef815ffc1b284c3f412a9e13; // 8 dec, 3600 s heartbeat
    address internal constant CL_USDC_USD_8 = 0xf5F15f188AbCB0d165D1Edb7f37F7d6fA2fCebec; // 8 dec, the one Mento relays

    // §13, §14.4 account abstraction
    address internal constant ENTRYPOINT_V08 = 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108;
    address internal constant SIMPLE_7702_ACCOUNT = 0xe6Cae83BdE06E4c305530e199D7217f42808555B;
    address internal constant PIMLICO_PAYMASTER_V08 = 0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402;

    // §14.5 AUSD balance storage: ERC-7201 root; slot = keccak256(abi.encode(account, ROOT)),
    // value = (balance << 8) | isFrozen. forge-std deal() does not work on AUSD.
    bytes32 internal constant AUSD_ERC20_CORE_STORAGE_SLOT =
        0x455730fed596673e69db1907be2e521374ba893f1a04cc5f5dd931616cd6b700;

    // Reference blocks used by pinned fork tests (rpc.monad.xyz keeps ~1M blocks of state).
    uint256 internal constant SATURDAY_BLOCK = 102_179_138; // 2026-09-05 12:00 UTC, FX market closed
    uint256 internal constant PRE_RELAY_BLOCK = 102_622_500; // placeholder; see ForkTest.PINNED_BLOCK
}
