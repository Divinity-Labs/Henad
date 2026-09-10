// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";
import {IMentoRouter} from "../interfaces/external/IMentoRouter.sol";
import {IFPMM} from "../interfaces/external/IFPMM.sol";
import {IOracleAdapter} from "../interfaces/external/IOracleAdapter.sol";

/// @title MentoVenueAdapter
/// @notice IVenueAdapter over Mento V3's Router on Monad. Every pair is routed
///         through USDm: one hop when either side is USDm, otherwise two hops
///         (assetIn -> USDm -> assetOut) in a single Router call.
/// @dev Stateless beyond two immutables. No owner, no setters, no pause, and no
///      funds at rest: the caller transfers `amountIn` here, `swap` approves the
///      Router for exactly that amount and the Router pulls it into the first
///      pool in the same transaction. Pool and oracle reverts bubble unchanged
///      (docs/INTEGRATION-FACTS.md §14.1): `recipient` must not be a pool token
///      address or the pool reverts `InvalidToAddress`.
contract MentoVenueAdapter is IVenueAdapter {
    using SafeERC20 for IERC20;

    /// @notice Mento V3 Router (0x4861840C… on Monad mainnet).
    IMentoRouter public immutable mentoRouter;

    /// @notice The hub asset every route passes through (Mento USDm).
    address public immutable usdm;

    error ZeroAddress();

    /// @param mentoRouter_ Mento V3 Router.
    /// @param usdm_        USDm, the common leg of every Mento FX pool.
    constructor(IMentoRouter mentoRouter_, address usdm_) {
        if (address(mentoRouter_) == address(0) || usdm_ == address(0)) revert ZeroAddress();
        mentoRouter = mentoRouter_;
        usdm = usdm_;
    }

    /// @inheritdoc IVenueAdapter
    function name() external pure returns (string memory) {
        return "mento:v3-router";
    }

    /// @inheritdoc IVenueAdapter
    /// @dev Walks every hop and returns the first non-Open verdict. Never reverts:
    ///      a pair the Router cannot even sort (zero or identical addresses), a pool
    ///      the factory has not deployed, and an oracle read that reverts all map
    ///      to NoRoute. Each pool has its own oracle adapter and rate feed, so both
    ///      are read from the pool rather than hardcoded (§14.2).
    function status(address assetIn, address assetOut) external view returns (Status) {
        IMentoRouter.Route[] memory routes = _routes(assetIn, assetOut);
        uint256 hops = routes.length;
        for (uint256 i; i < hops; ++i) {
            Status s = _hopStatus(routes[i].from, routes[i].to);
            if (s != Status.Open) return s;
        }
        return Status.Open;
    }

    /// @inheritdoc IVenueAdapter
    /// @dev Same code path the Router's swap uses, so within one block execution
    ///      equals this quote to the wei. Reverts with the pool's or oracle's own
    ///      error (`FXMarketClosed`, `NoRecentRate`, `TradingSuspended`, …) when it
    ///      cannot price.
    function quote(address assetIn, address assetOut, uint256 amountIn) external view returns (uint256 amountOut) {
        uint256[] memory amounts = mentoRouter.getAmountsOut(amountIn, _routes(assetIn, assetOut));
        return amounts[amounts.length - 1];
    }

    /// @inheritdoc IVenueAdapter
    /// @dev `amountIn` of `assetIn` must already sit in this contract. The Router
    ///      pulls it via `transferFrom` straight into the first pool and delivers
    ///      `assetOut` to `recipient`; intermediate USDm moves pool to pool, so the
    ///      adapter's balances are zero again when this returns. Deadline is
    ///      `block.timestamp` because the caller's intent carries its own expiry.
    function swap(address assetIn, address assetOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        IERC20(assetIn).forceApprove(address(mentoRouter), amountIn);
        uint256[] memory amounts = mentoRouter.swapExactTokensForTokens(
            amountIn, minAmountOut, _routes(assetIn, assetOut), recipient, block.timestamp
        );
        return amounts[amounts.length - 1];
    }

    /// @dev One hop when a side is USDm, else assetIn -> USDm -> assetOut. `view`
    ///      rather than `pure` only because solc forbids reading an immutable in a
    ///      pure function; it touches no storage. The
    ///      factory is left as address(0) so the Router resolves its default
    ///      FPMMFactory. A same-asset pair is not special-cased: the Router
    ///      reverts `SameAddresses` on it, and `status` reports NoRoute.
    function _routes(address assetIn, address assetOut) internal view returns (IMentoRouter.Route[] memory routes) {
        address hub = usdm;
        if (assetIn == hub || assetOut == hub) {
            routes = new IMentoRouter.Route[](1);
            routes[0] = IMentoRouter.Route({from: assetIn, to: assetOut, factory: address(0)});
        } else {
            routes = new IMentoRouter.Route[](2);
            routes[0] = IMentoRouter.Route({from: assetIn, to: hub, factory: address(0)});
            routes[1] = IMentoRouter.Route({from: hub, to: assetOut, factory: address(0)});
        }
    }

    /// @dev Tradability of a single pool. Order matters: a closed FX market is
    ///      reported before staleness because relays are blocked while the market
    ///      is closed, so a closed pool is always stale too.
    function _hopStatus(address from, address to) internal view returns (Status) {
        address pool;
        try mentoRouter.poolFor(from, to, address(0)) returns (address p) {
            pool = p;
        } catch {
            return Status.NoRoute; // SameAddresses / ZeroAddress from the Router's token sort
        }
        if (pool.code.length == 0) return Status.NoRoute; // precomputed but never deployed

        IFPMM fpmm = IFPMM(pool);
        IOracleAdapter.RateInfo memory info;
        try fpmm.oracleAdapter().getRate(fpmm.referenceRateFeedID()) returns (IOracleAdapter.RateInfo memory r) {
            info = r;
        } catch {
            return Status.NoRoute;
        }

        if (!info.isFXMarketOpen) return Status.MarketClosed;
        if (!info.isRecent) return Status.OracleStale;
        if (info.tradingMode != 0) return Status.TradingSuspended;
        return Status.Open;
    }
}
