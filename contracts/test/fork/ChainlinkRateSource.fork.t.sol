// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {console2} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ForkTest} from "../utils/ForkTest.sol";
import {MonadMainnet as M} from "../utils/MonadMainnet.sol";
import {ChainlinkRateSource} from "../../src/adapters/ChainlinkRateSource.sol";
import {IRateSource} from "../../src/interfaces/IRateSource.sol";
import {AggregatorV3Interface} from "../../src/interfaces/external/AggregatorV3Interface.sol";

/// @notice Reads the real Chainlink proxies on a Monad mainnet fork and proves the
///         receipt observation is replayable via `getRoundData`.
contract ChainlinkRateSourceForkTest is ForkTest {
    uint32 internal constant STABLE_MAX_AGE = 5400; // AUSD/USD, USDC/USD (3600 s heartbeat)
    uint32 internal constant FX_MAX_AGE = 600; // GBP/USD (240 s heartbeat)

    // Sanity band for GBP per USD-stable at any plausible 2026 rate.
    uint256 internal constant RATE_LO = 0.6e18;
    uint256 internal constant RATE_HI = 0.9e18;

    // Spec vector (docs/CONTRACTS-SPEC.md): AUSD/USD 99984996, GBP/USD 1.35024 at this block.
    uint256 internal constant VECTOR_BLOCK = 103_613_028;
    uint256 internal constant VECTOR_RATE = 740_497_955_918_947_742;

    ChainlinkRateSource internal src;

    function setUp() public {
        _forkMainnet();
        src = _deploy();
    }

    function _deploy() internal returns (ChainlinkRateSource) {
        ChainlinkRateSource.FeedPair[] memory pairs = new ChainlinkRateSource.FeedPair[](2);
        pairs[0] = ChainlinkRateSource.FeedPair({
            sourceAsset: M.AUSD,
            targetAsset: M.GBPM,
            base: AggregatorV3Interface(M.CL_AUSD_USD),
            quote: AggregatorV3Interface(M.CL_GBP_USD),
            baseMaxAge: STABLE_MAX_AGE,
            quoteMaxAge: FX_MAX_AGE
        });
        pairs[1] = ChainlinkRateSource.FeedPair({
            sourceAsset: M.USDC,
            targetAsset: M.GBPM,
            base: AggregatorV3Interface(M.CL_USDC_USD_8),
            quote: AggregatorV3Interface(M.CL_GBP_USD),
            baseMaxAge: STABLE_MAX_AGE,
            quoteMaxAge: FX_MAX_AGE
        });
        return new ChainlinkRateSource(pairs);
    }

    function testFork_proxyDescriptionsAndDecimals() public view {
        assertTrue(vm.contains(AggregatorV3Interface(M.CL_AUSD_USD).description(), "AUSD / USD"));
        assertTrue(vm.contains(AggregatorV3Interface(M.CL_GBP_USD).description(), "GBP / USD"));
        assertTrue(vm.contains(AggregatorV3Interface(M.CL_USDC_USD_8).description(), "USDC / USD"));

        (, uint8 bd, uint8 qd) = src.feeds(M.AUSD, M.GBPM);
        assertEq(bd, 8, "AUSD/USD proxy is 8 dec");
        assertEq(qd, 18, "GBP/USD proxy is 18 dec");
        assertEq(bd, AggregatorV3Interface(M.CL_AUSD_USD).decimals());
        assertEq(qd, AggregatorV3Interface(M.CL_GBP_USD).decimals());

        (, bd,) = src.feeds(M.USDC, M.GBPM);
        assertEq(bd, 8, "USDC/USD proxy is 8 dec");
        assertEq(bd, AggregatorV3Interface(M.CL_USDC_USD_8).decimals());

        assertEq(src.name(), "chainlink:composed-fiat-feeds");
        assertTrue(src.isSupported(M.AUSD, M.GBPM));
        assertTrue(src.isSupported(M.USDC, M.GBPM));
        assertFalse(src.isSupported(M.AUSD, M.EURM));
    }

    function testFork_getRate_ausdToGbpm_replaysFromObservation() public view {
        _assertRateAndReplay(M.AUSD, M.GBPM, M.CL_AUSD_USD, M.CL_GBP_USD);
    }

    function testFork_getRate_usdcToGbpm_replaysFromObservation() public view {
        _assertRateAndReplay(M.USDC, M.GBPM, M.CL_USDC_USD_8, M.CL_GBP_USD);
    }

    function testFork_getRate_unsupportedPairReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IRateSource.UnsupportedPair.selector, M.AUSD, M.EURM));
        src.getRate(M.AUSD, M.EURM);
    }

    function testFork_getRate_gas() public view {
        uint256 g = gasleft();
        src.getRate(M.AUSD, M.GBPM);
        g -= gasleft();
        console2.log("ChainlinkRateSource.getRate gas (real proxies, cold):", g);
        // Measured 141,270 at PINNED_BLOCK on MonadTen: two cold proxy -> aggregator hops
        // (each a cold account plus several cold MIP-8 page loads) dominate; our own two
        // config slots are one page. 200k is a regression guard, not a target.
        assertLt(g, 200_000, "getRate regressed past 200k gas");
    }

    /// @notice The spec's published vector, reproduced against the real chain at its block.
    /// @dev Skipped for latest-block runs (MONAD_FORK_BLOCK=0) because the vector is
    ///      only meaningful at VECTOR_BLOCK, which ages out of rpc.monad.xyz together
    ///      with PINNED_BLOCK.
    function testFork_specVector_atBlock103613028() public {
        if (vm.envOr("MONAD_FORK_BLOCK", PINNED_BLOCK) == 0) vm.skip(true);
        _forkMainnetAt(VECTOR_BLOCK);
        ChainlinkRateSource s = _deploy();

        (uint256 rate,, bytes32 obs) = s.getRate(M.AUSD, M.GBPM);
        assertEq(rate, VECTOR_RATE, "spec vector at block 103613028");

        (, int256 ab,,,) = AggregatorV3Interface(M.CL_AUSD_USD).getRoundData(uint80(uint256(obs) >> 80));
        (, int256 aq,,,) = AggregatorV3Interface(M.CL_GBP_USD).getRoundData(uint80(uint256(obs)));
        assertEq(ab, 99_984_996, "AUSD/USD answer at vector block");
        assertEq(aq, 1_350_240_000_000_000_000, "GBP/USD answer at vector block");
    }

    /// @dev REPLAY: read the rate, unpack the observation, fetch both rounds by id from
    ///      the proxies, recompute with the same formula, and require equality.
    function _assertRateAndReplay(address sourceAsset, address targetAsset, address baseProxy, address quoteProxy)
        internal
        view
    {
        (uint256 rate, uint64 updatedAt, bytes32 obs) = src.getRate(sourceAsset, targetAsset);
        console2.log("pair", sourceAsset, "->", targetAsset);
        console2.log("  rate (1e18)", rate);
        assertGe(rate, RATE_LO, "rate below 0.6");
        assertLe(rate, RATE_HI, "rate above 0.9");
        assertEq(uint256(obs) >> 160, 0, "upper bits must be zero");

        (uint256 scaledBase, uint256 ub) = _replayRound(baseProxy, uint80(uint256(obs) >> 80));
        (uint256 scaledQuote, uint256 uq) = _replayRound(quoteProxy, uint80(uint256(obs)));

        uint256 replayed = Math.mulDiv(scaledBase, 1e18, scaledQuote);
        assertEq(replayed, rate, "replay from observation must reproduce the rate");
        assertEq(updatedAt, ub < uq ? ub : uq, "updatedAt is the older timestamp");
        assertLe(block.timestamp - ub, STABLE_MAX_AGE, "base within max age");
        assertLe(block.timestamp - uq, FX_MAX_AGE, "quote within max age");
    }

    /// @dev `getRoundData(roundId)` on a proxy: asserts the round exists, is positive,
    ///      and is the proxy's latest round at this block; returns the answer lifted
    ///      to 18 decimals plus its updatedAt.
    function _replayRound(address proxy, uint80 roundId) internal view returns (uint256 scaled, uint256 updatedAt) {
        AggregatorV3Interface feed = AggregatorV3Interface(proxy);
        (uint80 got, int256 answer,, uint256 u,) = feed.getRoundData(roundId);
        assertEq(got, roundId, "round id echoed");
        assertGt(answer, 0, "positive answer");
        assertGt(u, 0, "round completed");

        (uint80 latest,,,,) = feed.latestRoundData();
        assertEq(latest, roundId, "observation is the latest round at this block");

        console2.log("  feed", proxy, "round", roundId);
        console2.log("    answer", uint256(answer), "age (s)", block.timestamp - u);

        scaled = uint256(answer) * 10 ** (18 - feed.decimals());
        updatedAt = u;
    }
}
