// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IOracleAdapter} from "./IOracleAdapter.sol";

/// @title IFPMM
/// @notice Read subset of a Mento V3 fixed-price market maker pool
///         (mento-core contracts/swap/FPMM.sol + router/interfaces/IRPool.sol).
///         Pools price at exactly the oracle rate minus (lpFee + protocolFee) bps.
///         Each pool has its OWN oracle adapter: never hardcode one
///         (docs/INTEGRATION-FACTS.md §14.2).
interface IFPMM {
    error InsufficientLiquidity(); // 0xbb55fd27
    error InvalidToAddress(); // 0x8aa3a72f
    error InsufficientInputAmount(); // 0x098fb561
    error L0LimitExceeded(); // 0x493e48f0
    error L1LimitExceeded(); // 0x91336c69

    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    function token0() external view returns (address);
    function token1() external view returns (address);
    function reserve0() external view returns (uint256);
    function reserve1() external view returns (uint256);
    function lpFee() external view returns (uint256); // bps
    function protocolFee() external view returns (uint256); // bps
    function oracleAdapter() external view returns (IOracleAdapter);
    function referenceRateFeedID() external view returns (address);
    function invertRateFeed() external view returns (bool);
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256 amountOut);
}
