// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ForkTest} from "../utils/ForkTest.sol";
import {MonadMainnet as M} from "../utils/MonadMainnet.sol";
import {MentoVenueAdapter} from "../../src/adapters/MentoVenueAdapter.sol";
import {IVenueAdapter} from "../../src/interfaces/IVenueAdapter.sol";
import {IMentoRouter} from "../../src/interfaces/external/IMentoRouter.sol";
import {IFPMM} from "../../src/interfaces/external/IFPMM.sol";
import {IOracleAdapter} from "../../src/interfaces/external/IOracleAdapter.sol";

/// @title MentoVenueAdapterForkTest
/// @notice Runs the adapter against the real Mento V3 Router, pools and oracle
///         adapters on a Monad mainnet fork at ForkTest.PINNED_BLOCK (FX market
///         open). The Saturday test forks MonadMainnet.SATURDAY_BLOCK separately.
/// @dev Env: MONAD_MAINNET_RPC_URL for the pinned fork; MONAD_ARCHIVE_RPC_URL
///      (default https://rpc-mainnet.monadinfra.com, Monad Foundation, 20 rps) for
///      the Saturday block, which is older than what rpc.monad.xyz / rpc3 keep.
contract MentoVenueAdapterForkTest is ForkTest {
    /// @dev Default archive endpoint for blocks older than the public RPCs' state
    ///      window (docs/INTEGRATION-FACTS.md §1 table).
    string internal constant ARCHIVE_RPC_DEFAULT = "https://rpc-mainnet.monadinfra.com";

    /// @dev First block at or after Fri 2026-09-04 21:00:00 UTC (timestamp
    ///      1788555600): the market-hours breaker has just closed but the last
    ///      GBP/USD relay (20:59) is still inside its 360 s expiry, so the FX
    ///      oracle adapter reports {isRecent: true, isFXMarketOpen: false}.
    ///      Read with cast: getRate -> (1.35154e18, 1e18, 0, true, false),
    ///      isFXMarketOpen() == false, hasRecentRate(GBP/USD) == true.
    uint256 internal constant FRIDAY_CLOSE_BLOCK = 102_001_572;

    /// @dev First block at or after Sun 2026-09-06 23:00:00 UTC (timestamp
    ///      1788735600): the market has just reopened and no relay has landed
    ///      since Friday, so {isRecent: false, isFXMarketOpen: true}. The first
    ///      post-open relay landed by block 102_593_574 (15 s later). Read with
    ///      cast: getRate -> (1.35154e18, 1e18, 0, false, true), isFXMarketOpen()
    ///      == true, hasRecentRate(GBP/USD) == false.
    uint256 internal constant SUNDAY_OPEN_BLOCK = 102_593_524;

    /// @dev Pool fees in bps as observed on-chain (§14.1); asserted, not assumed.
    uint256 internal constant USD_POOL_FEE_BPS = 5; // AUSD/USDm, USDC/USDm: lp 3 + protocol 2
    uint256 internal constant FX_POOL_FEE_BPS = 15; // GBPm/USDm etc.: lp 10 + protocol 5
    uint256 internal constant BPS = 10_000;
    /// @dev forge-std relative tolerance is 1e18-scaled: 1e14 == 0.01% == 1 bps.
    uint256 internal constant ONE_BPS_REL = 1e14;

    IMentoRouter internal constant ROUTER = IMentoRouter(M.MENTO_ROUTER);
    MentoVenueAdapter internal adapter;

    function setUp() public {
        _forkMainnet();
        adapter = new MentoVenueAdapter(ROUTER, M.USDM);
    }

    // ------------------------------------------------------------------ helpers

    function _forkArchiveAt(uint256 blockNumber) internal {
        string memory archive = vm.envOr("MONAD_ARCHIVE_RPC_URL", ARCHIVE_RPC_DEFAULT);
        forkId = vm.createSelectFork(archive, blockNumber);
        assertEq(block.chainid, M.CHAIN_ID, "not Monad mainnet");
    }

    /// @dev Fund `to` with `amount` of `token` without touching any Mento pool.
    function _fund(address token, address to, uint256 amount) internal {
        if (token == M.AUSD) {
            _dealAUSD(to, amount);
        } else if (token == M.USDC) {
            // FiatTokenV2_2: balanceAndBlacklistStates mapping lives in slot 9 and the
            // balance is the low 255 bits, so forge-std deal() finds it via stdstore.
            deal(token, to, amount);
            assertEq(IERC20(token).balanceOf(to), amount, "dealUSDC failed");
        } else {
            _dealMentoStable(token, to, amount);
        }
    }

    function _routesFor(address assetIn, address assetOut) internal pure returns (IMentoRouter.Route[] memory r) {
        if (assetIn == M.USDM || assetOut == M.USDM) {
            r = new IMentoRouter.Route[](1);
            r[0] = IMentoRouter.Route(assetIn, assetOut, address(0));
        } else {
            r = new IMentoRouter.Route[](2);
            r[0] = IMentoRouter.Route(assetIn, M.USDM, address(0));
            r[1] = IMentoRouter.Route(M.USDM, assetOut, address(0));
        }
    }

    function _routerQuote(address assetIn, address assetOut, uint256 amountIn) internal view returns (uint256) {
        uint256[] memory amounts = ROUTER.getAmountsOut(amountIn, _routesFor(assetIn, assetOut));
        return amounts[amounts.length - 1];
    }

    function _assertStatus(address assetIn, address assetOut, IVenueAdapter.Status expected, string memory label)
        internal
        view
    {
        assertEq(uint8(adapter.status(assetIn, assetOut)), uint8(expected), label);
    }

    /// @dev Full round trip for one pair: status Open, quote == Router quote, swap
    ///      delivers exactly the quote to a fresh recipient, adapter left empty.
    function _roundTrip(address assetIn, address assetOut, uint256 amountIn, string memory label)
        internal
        returns (uint256 delivered, uint256 gasUsed)
    {
        _assertStatus(assetIn, assetOut, IVenueAdapter.Status.Open, string.concat(label, ": status"));

        uint256 quoted = adapter.quote(assetIn, assetOut, amountIn);
        assertGt(quoted, 0, string.concat(label, ": zero quote"));
        assertEq(quoted, _routerQuote(assetIn, assetOut, amountIn), string.concat(label, ": quote != router"));

        address recipient = makeAddr(string.concat("recipient:", label));
        assertEq(IERC20(assetOut).balanceOf(recipient), 0);
        _fund(assetIn, address(adapter), amountIn);

        uint256 gasBefore = gasleft();
        uint256 reported = adapter.swap(assetIn, assetOut, amountIn, quoted, recipient);
        gasUsed = gasBefore - gasleft();

        delivered = IERC20(assetOut).balanceOf(recipient);
        assertEq(delivered, quoted, string.concat(label, ": delivered != quote"));
        assertEq(reported, quoted, string.concat(label, ": returned != quote"));
        assertEq(IERC20(assetIn).balanceOf(address(adapter)), 0, string.concat(label, ": assetIn left"));
        assertEq(IERC20(assetOut).balanceOf(address(adapter)), 0, string.concat(label, ": assetOut left"));
        assertEq(IERC20(M.USDM).balanceOf(address(adapter)), 0, string.concat(label, ": USDm left"));
        assertEq(IERC20(assetIn).allowance(address(adapter), M.MENTO_ROUTER), 0, string.concat(label, ": allowance"));
    }

    /// @dev What the pool's oracle says `amountIn` of `tokenIn` is worth in the other
    ///      token, before fees. Mirrors FPMM._getRateFeed + _convertWithRate.
    function _oracleImpliedOut(address pool, address tokenIn, uint256 amountIn) internal view returns (uint256) {
        IFPMM p = IFPMM(pool);
        (uint256 num, uint256 den) = p.oracleAdapter().getFXRateIfValid(p.referenceRateFeedID());
        if (p.invertRateFeed()) (num, den) = (den, num);
        address token0 = p.token0();
        address tokenOut = tokenIn == token0 ? p.token1() : token0;
        if (tokenIn != token0) (num, den) = (den, num); // rate is token1 per token0
        uint256 decIn = 10 ** IERC20Metadata(tokenIn).decimals();
        uint256 decOut = 10 ** IERC20Metadata(tokenOut).decimals();
        return (amountIn * num * decOut) / (den * decIn);
    }

    function _poolFeeBps(address pool) internal view returns (uint256) {
        return IFPMM(pool).lpFee() + IFPMM(pool).protocolFee();
    }

    // ---------------------------------------------------------------- metadata

    function test_name() public view {
        assertEq(adapter.name(), "mento:v3-router");
        assertEq(address(adapter.mentoRouter()), M.MENTO_ROUTER);
        assertEq(adapter.usdm(), M.USDM);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(MentoVenueAdapter.ZeroAddress.selector);
        new MentoVenueAdapter(IMentoRouter(address(0)), M.USDM);
        vm.expectRevert(MentoVenueAdapter.ZeroAddress.selector);
        new MentoVenueAdapter(ROUTER, address(0));
    }

    // ------------------------------------------------------- per-pair round trips

    function testFork_AUSD_to_GBPm() public {
        (, uint256 gasUsed) = _roundTrip(M.AUSD, M.GBPM, 1e6, "AUSD->GBPm");
        console.log("gas: MentoVenueAdapter.swap two-hop AUSD->USDm->GBPm (1e6 AUSD):", gasUsed);
    }

    function testFork_USDC_to_GBPm() public {
        _roundTrip(M.USDC, M.GBPM, 1e6, "USDC->GBPm");
    }

    function testFork_AUSD_to_EURm() public {
        _roundTrip(M.AUSD, M.EURM, 1e6, "AUSD->EURm");
    }

    function testFork_AUSD_to_CHFm() public {
        _roundTrip(M.AUSD, M.CHFM, 1e6, "AUSD->CHFm");
    }

    function testFork_AUSD_to_JPYm() public {
        _roundTrip(M.AUSD, M.JPYM, 1e6, "AUSD->JPYm");
    }

    function testFork_AUSD_to_USDm_singleHop() public {
        (, uint256 gasUsed) = _roundTrip(M.AUSD, M.USDM, 1e6, "AUSD->USDm");
        console.log("gas: MentoVenueAdapter.swap one-hop AUSD->USDm (1e6 AUSD):", gasUsed);
    }

    function testFork_USDm_to_GBPm_singleHop() public {
        _roundTrip(M.USDM, M.GBPM, 1e18, "USDm->GBPm");
    }

    // ------------------------------------------------------------------ guards

    function testFork_swap_revertsWhenMinOutExceedsQuote() public {
        uint256 quoted = adapter.quote(M.AUSD, M.GBPM, 1e6);
        _fund(M.AUSD, address(adapter), 1e6);
        address recipient = makeAddr("recipient:minOut");

        vm.expectRevert(IMentoRouter.InsufficientOutputAmount.selector);
        adapter.swap(M.AUSD, M.GBPM, 1e6, quoted + 1, recipient);

        // Nothing moved: the Router reverts before any transfer settles.
        assertEq(IERC20(M.AUSD).balanceOf(address(adapter)), 1e6);
        assertEq(IERC20(M.GBPM).balanceOf(recipient), 0);
    }

    function testFork_swap_bubblesInvalidToAddress() public {
        // Mento refuses to deliver to one of the pool's own tokens; the adapter
        // does not pre-check, the pool's error bubbles unchanged.
        uint256 quoted = adapter.quote(M.AUSD, M.GBPM, 1e6);
        _fund(M.AUSD, address(adapter), 1e6);
        vm.expectRevert(IFPMM.InvalidToAddress.selector);
        adapter.swap(M.AUSD, M.GBPM, 1e6, quoted, M.GBPM);
    }

    function testFork_status_noRouteNeverReverts() public {
        address random = makeAddr("not-a-mento-token");
        _assertStatus(M.AUSD, random, IVenueAdapter.Status.NoRoute, "AUSD->random");
        _assertStatus(random, M.GBPM, IVenueAdapter.Status.NoRoute, "random->GBPm");
        _assertStatus(random, M.USDM, IVenueAdapter.Status.NoRoute, "random->USDm (one hop)");
        _assertStatus(M.AUSD, address(0), IVenueAdapter.Status.NoRoute, "AUSD->0 (Router ZeroAddress)");
        _assertStatus(M.USDM, M.USDM, IVenueAdapter.Status.NoRoute, "USDm->USDm (Router SameAddresses)");
    }

    function testFork_status_sameAssetRoundTripIsOpen() public view {
        // Not a special case in the adapter: AUSD->AUSD routes AUSD->USDm->AUSD
        // through two real, open pools. CorridorRouter._requireOpen rejects
        // same-asset intents before any venue call, so the adapter stays literal.
        _assertStatus(M.AUSD, M.AUSD, IVenueAdapter.Status.Open, "AUSD->AUSD");
        assertGt(adapter.quote(M.AUSD, M.AUSD, 1e6), 0);
    }

    function testFork_status_openAllCorridors() public view {
        _assertStatus(M.AUSD, M.GBPM, IVenueAdapter.Status.Open, "AUSD->GBPm");
        _assertStatus(M.USDC, M.GBPM, IVenueAdapter.Status.Open, "USDC->GBPm");
        _assertStatus(M.AUSD, M.EURM, IVenueAdapter.Status.Open, "AUSD->EURm");
        _assertStatus(M.AUSD, M.CHFM, IVenueAdapter.Status.Open, "AUSD->CHFm");
        _assertStatus(M.AUSD, M.JPYM, IVenueAdapter.Status.Open, "AUSD->JPYm");
        _assertStatus(M.AUSD, M.USDM, IVenueAdapter.Status.Open, "AUSD->USDm");
        _assertStatus(M.USDM, M.GBPM, IVenueAdapter.Status.Open, "USDm->GBPm");
        // Reverse direction is the same pools.
        _assertStatus(M.GBPM, M.AUSD, IVenueAdapter.Status.Open, "GBPm->AUSD");
    }

    // ------------------------------------------------------------- fee sanity

    function testFork_feeSanity_AUSD_to_GBPm() public {
        // The pools this route crosses, read from the Router rather than assumed.
        address poolIn = ROUTER.poolFor(M.AUSD, M.USDM, address(0));
        address poolOut = ROUTER.poolFor(M.USDM, M.GBPM, address(0));
        assertEq(poolIn, M.POOL_AUSD_USDM, "AUSD/USDm pool moved");
        assertEq(poolOut, M.POOL_GBPM_USDM, "GBPm/USDm pool moved");
        assertEq(_poolFeeBps(poolIn), USD_POOL_FEE_BPS, "AUSD/USDm fee changed");
        assertEq(_poolFeeBps(poolOut), FX_POOL_FEE_BPS, "GBPm/USDm fee changed");

        (uint256 delivered,) = _roundTrip(M.AUSD, M.GBPM, 1e6, "fee-sanity");

        // Oracle-implied GBPm for 1 AUSD with no fees, hop by hop.
        uint256 impliedUsdm = _oracleImpliedOut(poolIn, M.AUSD, 1e6);
        uint256 impliedGbpm = _oracleImpliedOut(poolOut, M.USDM, impliedUsdm);
        uint256 expected = impliedGbpm * (BPS - USD_POOL_FEE_BPS) * (BPS - FX_POOL_FEE_BPS) / (BPS * BPS);

        assertLt(delivered, impliedGbpm, "delivered not below oracle-implied");
        assertApproxEqRel(delivered, expected, ONE_BPS_REL, "delivered vs oracle*(1-5bps)*(1-15bps) > 1 bps");

        // With exactly 1 AUSD in, `delivered` and `impliedGbpm` already are the
        // 1e18-scaled GBP-per-AUSD rates (executed and oracle).
        uint256 spreadBps = (impliedGbpm - delivered) * BPS / impliedGbpm;
        console.log("fee sanity: delivered GBPm per 1 AUSD", delivered);
        console.log("fee sanity: oracle-implied GBPm per 1 AUSD", impliedGbpm);
        console.log("fee sanity: spread vs pools' oracle (bps, floored)", spreadBps);
        assertTrue(spreadBps == 19 || spreadBps == 20, "two-hop fee outside 19-20 bps");
    }

    // --------------------------------------------------------------- saturday

    function testFork_saturday_marketClosed() public {
        _forkArchiveAt(M.SATURDAY_BLOCK);
        MentoVenueAdapter sat = new MentoVenueAdapter(ROUTER, M.USDM);

        assertEq(uint8(sat.status(M.AUSD, M.GBPM)), uint8(IVenueAdapter.Status.MarketClosed), "AUSD->GBPm");
        assertEq(uint8(sat.status(M.USDM, M.GBPM)), uint8(IVenueAdapter.Status.MarketClosed), "USDm->GBPm");

        vm.expectRevert(IOracleAdapter.FXMarketClosed.selector);
        sat.quote(M.AUSD, M.GBPM, 1e6);

        // The USD-stable pools use a breaker with checks disabled, so they stay open.
        assertEq(uint8(sat.status(M.AUSD, M.USDM)), uint8(IVenueAdapter.Status.Open), "AUSD->USDm");
        assertGt(sat.quote(M.AUSD, M.USDM, 1e6), 0, "AUSD->USDm should still quote");
    }

    // ------------------------------------------------- market-hours boundaries

    /// @dev At PINNED_BLOCK both RateInfo bools are true and at SATURDAY_BLOCK both
    ///      are false, so those tests cannot tell `isRecent` from `isFXMarketOpen`
    ///      (the OracleAdapter implementation is not source-verified, §14.6). The
    ///      Friday close is the one window where the pool is closed but still
    ///      recent: it pins the field order against the adapter's single-purpose
    ///      views and the closed-before-stale ordering in `_hopStatus`.
    function testFork_fridayClose_marketClosedBeforeStale() public {
        _forkArchiveAt(FRIDAY_CLOSE_BLOCK);
        MentoVenueAdapter fri = new MentoVenueAdapter(ROUTER, M.USDM);

        IFPMM pool = IFPMM(M.POOL_GBPM_USDM);
        IOracleAdapter fx = pool.oracleAdapter();
        address feed = pool.referenceRateFeedID();
        assertFalse(fx.isFXMarketOpen(), "market should have just closed");
        assertTrue(fx.hasRecentRate(feed), "last pre-close relay should still be recent");
        IOracleAdapter.RateInfo memory info = fx.getRate(feed);
        assertEq(info.tradingMode, 0, "tradingMode");
        assertTrue(info.isRecent, "RateInfo.isRecent must mirror hasRecentRate");
        assertFalse(info.isFXMarketOpen, "RateInfo.isFXMarketOpen must mirror isFXMarketOpen()");

        assertEq(uint8(fri.status(M.AUSD, M.GBPM)), uint8(IVenueAdapter.Status.MarketClosed), "AUSD->GBPm");
        assertEq(uint8(fri.status(M.USDM, M.GBPM)), uint8(IVenueAdapter.Status.MarketClosed), "USDm->GBPm");
        vm.expectRevert(IOracleAdapter.FXMarketClosed.selector);
        fri.quote(M.AUSD, M.GBPM, 1e6);

        assertEq(uint8(fri.status(M.AUSD, M.USDM)), uint8(IVenueAdapter.Status.Open), "AUSD->USDm");
        assertGt(fri.quote(M.AUSD, M.USDM, 1e6), 0, "AUSD->USDm should still quote");
    }

    /// @dev The Sunday open is the mirror window: open but no relay yet, so the
    ///      pool is OracleStale and the Router reverts NoRecentRate (§14.2).
    function testFork_sundayOpen_oracleStale() public {
        _forkArchiveAt(SUNDAY_OPEN_BLOCK);
        MentoVenueAdapter sun = new MentoVenueAdapter(ROUTER, M.USDM);

        IFPMM pool = IFPMM(M.POOL_GBPM_USDM);
        IOracleAdapter fx = pool.oracleAdapter();
        address feed = pool.referenceRateFeedID();
        assertTrue(fx.isFXMarketOpen(), "market should have just opened");
        assertFalse(fx.hasRecentRate(feed), "no relay should have landed yet");
        IOracleAdapter.RateInfo memory info = fx.getRate(feed);
        assertEq(info.tradingMode, 0, "tradingMode");
        assertFalse(info.isRecent, "RateInfo.isRecent must mirror hasRecentRate");
        assertTrue(info.isFXMarketOpen, "RateInfo.isFXMarketOpen must mirror isFXMarketOpen()");

        assertEq(uint8(sun.status(M.AUSD, M.GBPM)), uint8(IVenueAdapter.Status.OracleStale), "AUSD->GBPm");
        assertEq(uint8(sun.status(M.USDM, M.GBPM)), uint8(IVenueAdapter.Status.OracleStale), "USDm->GBPm");
        vm.expectRevert(IOracleAdapter.NoRecentRate.selector);
        sun.quote(M.AUSD, M.GBPM, 1e6);

        assertEq(uint8(sun.status(M.AUSD, M.USDM)), uint8(IVenueAdapter.Status.Open), "AUSD->USDm");
        assertGt(sun.quote(M.AUSD, M.USDM, 1e6), 0, "AUSD->USDm should still quote");
    }

    // ------------------------------------------- remaining status branches (mocked)

    /// @dev A non-zero BreakerBox trading mode cannot be produced at any pinned
    ///      block, so the FX adapter's getRate is mocked with the real RateInfo and
    ///      only tradingMode changed. The USD pools use a different adapter and
    ///      must be unaffected.
    function testFork_status_tradingSuspended() public {
        IFPMM pool = IFPMM(M.POOL_GBPM_USDM);
        IOracleAdapter fx = pool.oracleAdapter();
        address feed = pool.referenceRateFeedID();
        assertTrue(address(fx) != address(IFPMM(M.POOL_AUSD_USDM).oracleAdapter()), "pools share an adapter");

        IOracleAdapter.RateInfo memory info = fx.getRate(feed);
        assertEq(info.tradingMode, 0);
        info.tradingMode = 1;
        vm.mockCall(address(fx), abi.encodeCall(IOracleAdapter.getRate, (feed)), abi.encode(info));

        _assertStatus(M.AUSD, M.GBPM, IVenueAdapter.Status.TradingSuspended, "AUSD->GBPm");
        _assertStatus(M.USDM, M.GBPM, IVenueAdapter.Status.TradingSuspended, "USDm->GBPm");
        _assertStatus(M.AUSD, M.EURM, IVenueAdapter.Status.Open, "AUSD->EURm (other feed)");
        _assertStatus(M.AUSD, M.USDM, IVenueAdapter.Status.Open, "AUSD->USDm (other adapter)");
        vm.clearMockedCalls();
    }

    /// @dev An oracle read that reverts maps to NoRoute rather than bubbling, so
    ///      `status` keeps its never-reverts contract for the UI pre-flight.
    function testFork_status_oracleRevertIsNoRoute() public {
        IFPMM pool = IFPMM(M.POOL_GBPM_USDM);
        IOracleAdapter fx = pool.oracleAdapter();
        address feed = pool.referenceRateFeedID();
        vm.mockCallRevert(
            address(fx),
            abi.encodeCall(IOracleAdapter.getRate, (feed)),
            abi.encodeWithSelector(IOracleAdapter.InvalidRate.selector)
        );

        _assertStatus(M.AUSD, M.GBPM, IVenueAdapter.Status.NoRoute, "AUSD->GBPm");
        _assertStatus(M.AUSD, M.USDM, IVenueAdapter.Status.Open, "AUSD->USDm (other adapter)");
        vm.clearMockedCalls();
    }
}
