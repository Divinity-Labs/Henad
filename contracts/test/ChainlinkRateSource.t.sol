// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test, console2} from "forge-std/Test.sol";
import {ChainlinkRateSource} from "../src/adapters/ChainlinkRateSource.sol";
import {IRateSource} from "../src/interfaces/IRateSource.sol";
import {MockAggregator} from "./mocks/MockAggregator.sol";

contract ChainlinkRateSourceTest is Test {
    uint256 internal constant T0 = 1_800_000_000; // fixed "now" for every test
    uint32 internal constant BASE_MAX_AGE = 5400; // AUSD/USD, USDC/USD
    uint32 internal constant QUOTE_MAX_AGE = 600; // GBP/USD

    // Spec vector at block 103613028 (docs/CONTRACTS-SPEC.md, INTEGRATION-FACTS §14.3).
    int256 internal constant AUSD_USD_8 = 99_984_996;
    int256 internal constant AUSD_USD_18 = 999_849_960_000_000_000;
    int256 internal constant GBP_USD_8 = 135_024_000;
    int256 internal constant GBP_USD_18 = 1_350_240_000_000_000_000;
    uint256 internal constant EXPECTED_RATE = 740_497_955_918_947_742;

    address internal ausd = makeAddr("AUSD");
    address internal usdc = makeAddr("USDC");
    address internal gbpm = makeAddr("GBPm");
    address internal eurm = makeAddr("EURm");

    MockAggregator internal ausdUsd; // 8 dec
    MockAggregator internal gbpUsd; // 18 dec
    ChainlinkRateSource internal src;

    function setUp() public {
        vm.warp(T0);
        ausdUsd = new MockAggregator(8, "AUSD / USD");
        gbpUsd = new MockAggregator(18, "GBP / USD");
        ausdUsd.setRound(1, AUSD_USD_8, T0 - 100);
        gbpUsd.setRound(2, GBP_USD_18, T0 - 50);
        src = new ChainlinkRateSource(_single(ausd, gbpm, ausdUsd, gbpUsd));
    }

    // ---------------------------------------------------------------- helpers

    function _pair(address s, address t, MockAggregator base, MockAggregator quote)
        internal
        pure
        returns (ChainlinkRateSource.FeedPair memory)
    {
        return ChainlinkRateSource.FeedPair({
            sourceAsset: s,
            targetAsset: t,
            base: base,
            quote: quote,
            baseMaxAge: BASE_MAX_AGE,
            quoteMaxAge: QUOTE_MAX_AGE
        });
    }

    function _single(address s, address t, MockAggregator base, MockAggregator quote)
        internal
        pure
        returns (ChainlinkRateSource.FeedPair[] memory pairs)
    {
        pairs = new ChainlinkRateSource.FeedPair[](1);
        pairs[0] = _pair(s, t, base, quote);
    }

    /// @dev Deploys a fresh pair with the given decimals and answers, both updated at T0 - 1.
    function _deployWith(uint8 baseDec, int256 baseAnswer, uint8 quoteDec, int256 quoteAnswer)
        internal
        returns (ChainlinkRateSource s)
    {
        MockAggregator base = new MockAggregator(baseDec, "B / USD");
        MockAggregator quote = new MockAggregator(quoteDec, "Q / USD");
        base.setRound(1, baseAnswer, T0 - 1);
        quote.setRound(1, quoteAnswer, T0 - 1);
        s = new ChainlinkRateSource(_single(ausd, gbpm, base, quote));
    }

    function _stale(address feed, uint256 updatedAt, uint32 maxAge) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IRateSource.StaleReferenceRate.selector, feed, updatedAt, uint256(maxAge));
    }

    function _invalid(address feed, int256 answer) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IRateSource.InvalidReferenceAnswer.selector, feed, answer);
    }

    // ---------------------------------------------------------------- identity

    function test_name_and_rateDecimals() public view {
        assertEq(src.name(), "chainlink:composed-fiat-feeds");
        assertEq(src.RATE_DECIMALS(), 18);
    }

    // ---------------------------------------------------------------- constructor

    function test_constructor_storesPairAndDecimals() public view {
        (ChainlinkRateSource.FeedPair memory p, uint8 bd, uint8 qd) = src.feeds(ausd, gbpm);
        assertEq(p.sourceAsset, ausd);
        assertEq(p.targetAsset, gbpm);
        assertEq(address(p.base), address(ausdUsd));
        assertEq(address(p.quote), address(gbpUsd));
        assertEq(p.baseMaxAge, BASE_MAX_AGE);
        assertEq(p.quoteMaxAge, QUOTE_MAX_AGE);
        assertEq(bd, 8);
        assertEq(qd, 18);
        assertTrue(src.isSupported(ausd, gbpm));
        assertFalse(src.isSupported(gbpm, ausd), "pairs are directional");
        assertFalse(src.isSupported(ausd, eurm));
    }

    function test_constructor_registersMultiplePairsIndependently() public {
        MockAggregator usdcUsd = new MockAggregator(8, "USDC / USD");
        usdcUsd.setRound(7, 100_010_000, T0 - 10); // 1.0001

        ChainlinkRateSource.FeedPair[] memory pairs = new ChainlinkRateSource.FeedPair[](2);
        pairs[0] = _pair(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[1] = _pair(usdc, gbpm, usdcUsd, gbpUsd);
        ChainlinkRateSource multi = new ChainlinkRateSource(pairs);

        assertTrue(multi.isSupported(ausd, gbpm));
        assertTrue(multi.isSupported(usdc, gbpm));
        (uint256 rAusd,,) = multi.getRate(ausd, gbpm);
        (uint256 rUsdc,, bytes32 obsUsdc) = multi.getRate(usdc, gbpm);
        assertEq(rAusd, EXPECTED_RATE);
        assertEq(rUsdc, (uint256(100_010_000) * 1e10 * 1e18) / uint256(GBP_USD_18));
        assertEq(obsUsdc, bytes32((uint256(7) << 80) | 2));
    }

    function test_constructor_rejectsZeroAddresses() public {
        ChainlinkRateSource.FeedPair[] memory pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);

        pairs[0].sourceAsset = address(0);
        vm.expectRevert(ChainlinkRateSource.ZeroAddress.selector);
        new ChainlinkRateSource(pairs);

        pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[0].targetAsset = address(0);
        vm.expectRevert(ChainlinkRateSource.ZeroAddress.selector);
        new ChainlinkRateSource(pairs);

        pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[0].base = MockAggregator(address(0));
        vm.expectRevert(ChainlinkRateSource.ZeroAddress.selector);
        new ChainlinkRateSource(pairs);

        pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[0].quote = MockAggregator(address(0));
        vm.expectRevert(ChainlinkRateSource.ZeroAddress.selector);
        new ChainlinkRateSource(pairs);
    }

    function test_constructor_rejectsZeroMaxAge() public {
        ChainlinkRateSource.FeedPair[] memory pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[0].baseMaxAge = 0;
        vm.expectRevert(abi.encodeWithSelector(ChainlinkRateSource.ZeroMaxAge.selector, address(ausdUsd)));
        new ChainlinkRateSource(pairs);

        pairs = _single(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[0].quoteMaxAge = 0;
        vm.expectRevert(abi.encodeWithSelector(ChainlinkRateSource.ZeroMaxAge.selector, address(gbpUsd)));
        new ChainlinkRateSource(pairs);
    }

    function test_constructor_rejectsDuplicatePair() public {
        ChainlinkRateSource.FeedPair[] memory pairs = new ChainlinkRateSource.FeedPair[](2);
        pairs[0] = _pair(ausd, gbpm, ausdUsd, gbpUsd);
        pairs[1] = _pair(ausd, gbpm, ausdUsd, gbpUsd); // same key, even with identical config
        vm.expectRevert(abi.encodeWithSelector(ChainlinkRateSource.DuplicatePair.selector, ausd, gbpm));
        new ChainlinkRateSource(pairs);
    }

    function test_constructor_rejectsFeedDecimalsAbove18() public {
        MockAggregator wide = new MockAggregator(19, "WIDE / USD");
        wide.setRound(1, 1e19, T0 - 1);

        vm.expectRevert(
            abi.encodeWithSelector(ChainlinkRateSource.UnsupportedFeedDecimals.selector, address(wide), uint8(19))
        );
        new ChainlinkRateSource(_single(ausd, gbpm, wide, gbpUsd));

        vm.expectRevert(
            abi.encodeWithSelector(ChainlinkRateSource.UnsupportedFeedDecimals.selector, address(wide), uint8(19))
        );
        new ChainlinkRateSource(_single(ausd, gbpm, ausdUsd, wide));
    }

    function test_constructor_readsDecimalsOnce() public {
        // Changing decimals on the proxy after deployment must not change scaling.
        ausdUsd.setDecimals(18);
        gbpUsd.setDecimals(8);
        (, uint8 bd, uint8 qd) = src.feeds(ausd, gbpm);
        assertEq(bd, 8);
        assertEq(qd, 18);
        (uint256 rate,,) = src.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
    }

    // ---------------------------------------------------------------- composition

    function test_getRate_specVector() public view {
        (uint256 rate, uint64 updatedAt, bytes32 observation) = src.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE, "AUSD/USD 99984996 @8 over GBP/USD 1.35024 @18");
        assertEq(updatedAt, T0 - 100, "oldest of the two timestamps");
        assertEq(observation, bytes32((uint256(1) << 80) | 2));
    }

    function test_getRate_18and18Decimals() public {
        ChainlinkRateSource s = _deployWith(18, AUSD_USD_18, 18, GBP_USD_18);
        (uint256 rate,,) = s.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
    }

    function test_getRate_8and8Decimals() public {
        ChainlinkRateSource s = _deployWith(8, AUSD_USD_8, 8, GBP_USD_8);
        (uint256 rate,,) = s.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
    }

    function test_getRate_18baseOver8quote() public {
        ChainlinkRateSource s = _deployWith(18, AUSD_USD_18, 8, GBP_USD_8);
        (uint256 rate,,) = s.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
    }

    function test_getRate_zeroDecimalFeeds() public {
        // 3 units of base over 2 units of quote = 1.5e18; also proves 10**18 scaling on 0-dec feeds.
        ChainlinkRateSource s = _deployWith(0, 3, 0, 2);
        (uint256 rate,,) = s.getRate(ausd, gbpm);
        assertEq(rate, 1.5e18);
    }

    function test_getRate_roundsDown() public {
        // 1 / 3 = 0.333... -> floor to 333333333333333333
        ChainlinkRateSource s = _deployWith(8, 1e8, 8, 3e8);
        (uint256 rate,,) = s.getRate(ausd, gbpm);
        assertEq(rate, 333_333_333_333_333_333);
    }

    function test_getRate_updatedAtIsMinOfBoth() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0 - 10);
        gbpUsd.setRound(2, GBP_USD_18, T0 - 400);
        (, uint64 updatedAt,) = src.getRate(ausd, gbpm);
        assertEq(updatedAt, T0 - 400, "quote older");

        ausdUsd.setRound(1, AUSD_USD_8, T0 - 3000);
        gbpUsd.setRound(2, GBP_USD_18, T0 - 5);
        (, updatedAt,) = src.getRate(ausd, gbpm);
        assertEq(updatedAt, T0 - 3000, "base older");
    }

    // ---------------------------------------------------------------- observation

    function test_getRate_observationPacksBothRoundIds() public {
        uint80 rb = 0x0123456789ABCDEF0123;
        uint80 rq = 0xFEDCBA9876543210FEDC;
        ausdUsd.setRound(rb, AUSD_USD_8, T0 - 1);
        gbpUsd.setRound(rq, GBP_USD_18, T0 - 1);
        (,, bytes32 obs) = src.getRate(ausd, gbpm);

        assertEq(obs, bytes32((uint256(rb) << 80) | uint256(rq)));
        assertEq(uint80(uint256(obs) >> 80), rb, "base round id in bits 80..159");
        assertEq(uint80(uint256(obs)), rq, "quote round id in bits 0..79");
        assertEq(uint256(obs) >> 160, 0, "upper 96 bits unused");
    }

    function test_getRate_observationPacksMaxRoundIds() public {
        uint80 max = type(uint80).max;
        ausdUsd.setRound(max, AUSD_USD_8, T0 - 1);
        gbpUsd.setRound(max, GBP_USD_18, T0 - 1);
        (,, bytes32 obs) = src.getRate(ausd, gbpm);

        assertEq(obs, bytes32((uint256(max) << 80) | uint256(max)));
        assertEq(uint80(uint256(obs) >> 80), max);
        assertEq(uint80(uint256(obs)), max);
        assertEq(uint256(obs) >> 160, 0);

        // No cross-contamination when only one side is at max.
        gbpUsd.setRound(0, GBP_USD_18, T0 - 1);
        (,, obs) = src.getRate(ausd, gbpm);
        assertEq(obs, bytes32(uint256(max) << 80));
        ausdUsd.setRound(0, AUSD_USD_8, T0 - 1);
        gbpUsd.setRound(max, GBP_USD_18, T0 - 1);
        (,, obs) = src.getRate(ausd, gbpm);
        assertEq(obs, bytes32(uint256(max)));
    }

    // ---------------------------------------------------------------- staleness

    function test_getRate_baseStale() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0 - BASE_MAX_AGE - 1);
        vm.expectRevert(_stale(address(ausdUsd), T0 - BASE_MAX_AGE - 1, BASE_MAX_AGE));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_quoteStale() public {
        gbpUsd.setRound(2, GBP_USD_18, T0 - QUOTE_MAX_AGE - 1);
        vm.expectRevert(_stale(address(gbpUsd), T0 - QUOTE_MAX_AGE - 1, QUOTE_MAX_AGE));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_acceptsExactlyAtMaxAge() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0 - BASE_MAX_AGE);
        gbpUsd.setRound(2, GBP_USD_18, T0 - QUOTE_MAX_AGE);
        (uint256 rate, uint64 updatedAt,) = src.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
        assertEq(updatedAt, T0 - BASE_MAX_AGE);
    }

    function test_getRate_acceptsUpdatedAtNow() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0);
        gbpUsd.setRound(2, GBP_USD_18, T0);
        (uint256 rate, uint64 updatedAt,) = src.getRate(ausd, gbpm);
        assertEq(rate, EXPECTED_RATE);
        assertEq(updatedAt, T0);
    }

    function test_getRate_baseStaleReportedBeforeQuoteStale() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0 - BASE_MAX_AGE - 1);
        gbpUsd.setRound(2, GBP_USD_18, T0 - QUOTE_MAX_AGE - 1);
        vm.expectRevert(_stale(address(ausdUsd), T0 - BASE_MAX_AGE - 1, BASE_MAX_AGE));
        src.getRate(ausd, gbpm);
    }

    // ---------------------------------------------------------------- validity

    function test_getRate_rejectsBaseAnswerZeroOrNegative() public {
        ausdUsd.setRound(1, 0, T0 - 1);
        vm.expectRevert(_invalid(address(ausdUsd), 0));
        src.getRate(ausd, gbpm);

        ausdUsd.setRound(1, -1, T0 - 1);
        vm.expectRevert(_invalid(address(ausdUsd), -1));
        src.getRate(ausd, gbpm);

        ausdUsd.setRound(1, type(int256).min, T0 - 1);
        vm.expectRevert(_invalid(address(ausdUsd), type(int256).min));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_rejectsQuoteAnswerZeroOrNegative() public {
        gbpUsd.setRound(2, 0, T0 - 1);
        vm.expectRevert(_invalid(address(gbpUsd), 0));
        src.getRate(ausd, gbpm);

        gbpUsd.setRound(2, -1, T0 - 1);
        vm.expectRevert(_invalid(address(gbpUsd), -1));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_rejectsZeroUpdatedAt() public {
        ausdUsd.setRound(1, AUSD_USD_8, 0);
        vm.expectRevert(_invalid(address(ausdUsd), AUSD_USD_8));
        src.getRate(ausd, gbpm);

        ausdUsd.setRound(1, AUSD_USD_8, T0 - 1);
        gbpUsd.setRound(2, GBP_USD_18, 0);
        vm.expectRevert(_invalid(address(gbpUsd), GBP_USD_18));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_rejectsFutureUpdatedAt() public {
        ausdUsd.setRound(1, AUSD_USD_8, T0 + 1);
        vm.expectRevert(_invalid(address(ausdUsd), AUSD_USD_8));
        src.getRate(ausd, gbpm);

        ausdUsd.setRound(1, AUSD_USD_8, T0 - 1);
        gbpUsd.setRound(2, GBP_USD_18, T0 + 1);
        vm.expectRevert(_invalid(address(gbpUsd), GBP_USD_18));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_validityCheckedBeforeStaleness() public {
        // Base is both invalid and stale: the invalid answer wins.
        ausdUsd.setRound(1, 0, T0 - BASE_MAX_AGE - 1000);
        vm.expectRevert(_invalid(address(ausdUsd), 0));
        src.getRate(ausd, gbpm);

        // Base is merely stale, quote is invalid: quote validity is still checked first.
        ausdUsd.setRound(1, AUSD_USD_8, T0 - BASE_MAX_AGE - 1);
        gbpUsd.setRound(2, -5, T0 - 1);
        vm.expectRevert(_invalid(address(gbpUsd), -5));
        src.getRate(ausd, gbpm);
    }

    function test_getRate_bubblesFeedRevert() public {
        // A proxy with no completed round reverts inside latestRoundData (EACAggregatorProxy
        // "No data present"). getRate must bubble that revert untouched, never mask it as
        // InvalidReferenceAnswer or StaleReferenceRate, whichever side of the pair it is on.
        MockAggregator empty = new MockAggregator(8, "EMPTY / USD");
        ChainlinkRateSource s = new ChainlinkRateSource(_single(ausd, gbpm, empty, gbpUsd));
        vm.expectRevert(abi.encodeWithSelector(MockAggregator.NoData.selector, uint80(0)));
        s.getRate(ausd, gbpm);

        s = new ChainlinkRateSource(_single(ausd, gbpm, ausdUsd, empty));
        vm.expectRevert(abi.encodeWithSelector(MockAggregator.NoData.selector, uint80(0)));
        s.getRate(ausd, gbpm);
    }

    // ---------------------------------------------------------------- registry

    function test_getRate_unsupportedPair() public {
        vm.expectRevert(abi.encodeWithSelector(IRateSource.UnsupportedPair.selector, gbpm, ausd));
        src.getRate(gbpm, ausd);

        vm.expectRevert(abi.encodeWithSelector(IRateSource.UnsupportedPair.selector, ausd, eurm));
        src.getRate(ausd, eurm);

        vm.expectRevert(abi.encodeWithSelector(IRateSource.UnsupportedPair.selector, ausd, eurm));
        src.feeds(ausd, eurm);

        assertFalse(src.isSupported(ausd, eurm));
    }

    function test_getRate_gasReport() public view {
        uint256 g = gasleft();
        src.getRate(ausd, gbpm);
        g -= gasleft();
        console2.log("ChainlinkRateSource.getRate gas (mock feeds, warm):", g);
    }

    // ---------------------------------------------------------------- fuzz

    /// @dev rate == floor(b * 1e18 * 10^(18-bd) / (q * 10^(18-qd))) for any positive answers.
    ///      Bounds keep every intermediate below 1e66 < 2^256 so the reference
    ///      computation below is exact plain arithmetic, independent of mulDiv.
    function testFuzz_getRate_isFloorOfScaledQuotient(uint256 b, uint256 q, uint8 bd, uint8 qd, uint80 rb, uint80 rq)
        public
    {
        b = bound(b, 1, 1e30);
        q = bound(q, 1, 1e30);
        bd = uint8(bound(bd, 0, 18));
        qd = uint8(bound(qd, 0, 18));

        MockAggregator base = new MockAggregator(bd, "B / USD");
        MockAggregator quote = new MockAggregator(qd, "Q / USD");
        base.setRound(rb, int256(b), T0 - 1);
        quote.setRound(rq, int256(q), T0 - 2);
        ChainlinkRateSource s = new ChainlinkRateSource(_single(ausd, gbpm, base, quote));

        (uint256 rate, uint64 updatedAt, bytes32 obs) = s.getRate(ausd, gbpm);

        uint256 expected = (b * 1e18 * 10 ** (18 - bd)) / (q * 10 ** (18 - qd));
        assertEq(rate, expected, "floor(b*1e18*10^(18-bd) / (q*10^(18-qd)))");
        assertEq(updatedAt, T0 - 2);
        assertEq(obs, bytes32((uint256(rb) << 80) | uint256(rq)));
    }

    /// @dev Fresh iff age <= maxAge on both feeds; base is reported before quote.
    function testFuzz_getRate_stalenessBoundary(uint32 baseAge, uint32 quoteAge) public {
        baseAge = uint32(bound(baseAge, 0, 2 * uint256(BASE_MAX_AGE)));
        quoteAge = uint32(bound(quoteAge, 0, 2 * uint256(QUOTE_MAX_AGE)));
        ausdUsd.setRound(1, AUSD_USD_8, T0 - baseAge);
        gbpUsd.setRound(2, GBP_USD_18, T0 - quoteAge);

        bool fresh = baseAge <= BASE_MAX_AGE && quoteAge <= QUOTE_MAX_AGE;
        if (baseAge > BASE_MAX_AGE) {
            vm.expectRevert(_stale(address(ausdUsd), T0 - baseAge, BASE_MAX_AGE));
        } else if (quoteAge > QUOTE_MAX_AGE) {
            vm.expectRevert(_stale(address(gbpUsd), T0 - quoteAge, QUOTE_MAX_AGE));
        }
        (uint256 rate, uint64 updatedAt,) = src.getRate(ausd, gbpm);
        if (fresh) {
            assertEq(rate, EXPECTED_RATE);
            assertEq(updatedAt, T0 - (baseAge > quoteAge ? baseAge : quoteAge));
        }
    }
}
