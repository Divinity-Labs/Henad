// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IVenueAdapter
/// @notice Executes one leg-or-more swap on an external venue (Mento V3 Router on
///         Monad) and returns exactly how much target asset was delivered.
/// @dev The adapter never holds funds between calls. The router transfers
///      `amountIn` of `assetIn` to the adapter, calls `swap`, and the adapter must
///      deliver `assetOut` straight to `recipient`. The realised rate is computed
///      by the caller from `amountIn` and `amountOut`; adapters do not report rates.
interface IVenueAdapter {
    /// @notice Human-readable label, e.g. "mento:v3-router".
    function name() external view returns (string memory);

    /// @notice Quote without executing. Used for the pre-signing spread disclosure.
    function quote(address assetIn, address assetOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);

    /// @notice Execute the swap and deliver `assetOut` to `recipient`.
    /// @param assetIn      token already transferred to this adapter by the caller.
    /// @param assetOut     token to deliver.
    /// @param amountIn     amount of `assetIn` held for this swap.
    /// @param minAmountOut revert if fewer than this would be delivered.
    /// @param recipient    final receiver of `assetOut`.
    /// @return amountOut   amount actually delivered to `recipient`.
    function swap(
        address assetIn,
        address assetOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
}
