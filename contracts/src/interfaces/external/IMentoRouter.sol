// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IMentoRouter
/// @notice Minimal subset of Mento V3's Router (mento-core `develop`,
///         contracts/swap/router/Router.sol). Verified on Monad mainnet at
///         0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6 (docs/INTEGRATION-FACTS.md §14.1).
///         mento-core is BUSL-1.1 and pinned to solc 0.8.24, so we do not import it.
interface IMentoRouter {
    struct Route {
        address from;
        address to;
        address factory; // address(0) => defaultFactory (FPMMFactory)
    }

    error Expired(); // 0x203d82d8
    error InsufficientOutputAmount(); // 0x42301c23
    error PoolDoesNotExist(); // 0x9c8787c0

    function defaultFactory() external view returns (address);

    /// @notice Pool address for a pair under a factory (address(0) = default).
    function poolFor(address tokenA, address tokenB, address _factory) external view returns (address pool);

    /// @notice Chained quote. Same code path as the swap: within one block,
    ///         execution equals this quote to the wei. Reverts (does not return 0)
    ///         when the pool's oracle is invalid.
    function getAmountsOut(uint256 amountIn, Route[] memory routes) external view returns (uint256[] memory amounts);

    /// @notice Pulls `amountIn` of routes[0].from from msg.sender via transferFrom
    ///         into the first pool and delivers routes[last].to to `to`.
    ///         `to` must not be a pool token address (FPMM.InvalidToAddress).
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
