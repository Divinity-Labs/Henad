// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IVenueAdapter
/// @notice Executes a swap on an external venue (Mento V3 on Monad) and delivers
///         the target asset straight to the recipient.
/// @dev The caller transfers `amountIn` of `assetIn` to the adapter, then calls
///      `swap`. The adapter must never hold funds between calls. Rates are not
///      reported by adapters; the router derives the executed rate from the
///      recipient's balance delta.
interface IVenueAdapter {
    /// @notice Why a pair cannot trade right now. `Open` means it can.
    enum Status {
        Open,
        NoRoute,
        MarketClosed,
        OracleStale,
        TradingSuspended
    }

    error NoRoute(address assetIn, address assetOut);

    /// @notice Human-readable label, e.g. "mento:v3-router".
    function name() external view returns (string memory);

    /// @notice Tradability without reverting, for the UI and relayer pre-flight.
    function status(address assetIn, address assetOut) external view returns (Status);

    /// @notice Venue quote. Reverts with the venue's own errors when it cannot price.
    function quote(address assetIn, address assetOut, uint256 amountIn) external view returns (uint256 amountOut);

    /// @notice Execute and deliver `assetOut` to `recipient`.
    /// @param amountIn     amount of `assetIn` already transferred to this adapter.
    /// @param minAmountOut revert if fewer than this would be delivered.
    /// @return amountOut   amount the venue reports as delivered.
    function swap(address assetIn, address assetOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut);
}
