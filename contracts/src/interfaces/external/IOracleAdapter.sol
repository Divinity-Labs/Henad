// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IOracleAdapter
/// @notice Read subset of Mento V3's OracleAdapter (mento-core
///         contracts/oracles/OracleAdapter.sol). Returns 18-decimal rates from
///         SortedOracles gated by BreakerBox trading mode, report freshness and
///         FX market hours (docs/INTEGRATION-FACTS.md §14.2).
interface IOracleAdapter {
    struct RateInfo {
        uint256 numerator;
        uint256 denominator;
        uint8 tradingMode; // 0 = bidirectional (tradable); anything else reverts TradingSuspended
        bool isRecent;
        bool isFXMarketOpen;
    }

    error FXMarketClosed(); // 0xa407143a
    error TradingSuspended(); // 0x4ac30c22
    error InvalidRate(); // 0x6a43f8d1
    error NoRecentRate(); // 0xeb0d3e81

    function marketHoursBreaker() external view returns (address);
    function isFXMarketOpen() external view returns (bool);
    function hasRecentRate(address rateFeedID) external view returns (bool);

    /// @notice Never reverts for a known feed; use for tradability pre-checks.
    function getRate(address rateFeedID) external view returns (RateInfo memory);

    /// @notice The rate the pool actually prices with; reverts with the errors above.
    function getFXRateIfValid(address rateFeedID) external view returns (uint256 numerator, uint256 denominator);
}
