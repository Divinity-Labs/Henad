// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IRateSource
/// @notice A named, addressable, replayable source of a reference exchange rate
///         for an asset pair. Henad never sets rates: every implementation reads
///         on-chain oracles and returns enough provenance for anyone to re-derive
///         the number later.
/// @dev Keyed by (sourceAsset, targetAsset) rather than by currency pair because
///      two source assets in the same currency (AUSD, USDC) have different feeds.
///      Rates are 1e18 fixed point, target units per one source unit
///      (AUSD -> GBPm ≈ 0.74e18). The receipt records `address(this)` as the
///      rate source; implementations expose their underlying feeds separately.
interface IRateSource {
    error UnsupportedPair(address sourceAsset, address targetAsset);
    error StaleReferenceRate(address feed, uint256 updatedAt, uint256 maxAge);
    error InvalidReferenceAnswer(address feed, int256 answer);

    /// @notice Fixed-point scale of every rate returned here. Always 18.
    function RATE_DECIMALS() external pure returns (uint8);

    /// @notice Human-readable label, e.g. "chainlink:composed-fiat-feeds".
    function name() external view returns (string memory);

    /// @notice Latest reference rate for a pair. Reverts if unsupported, stale, or invalid.
    /// @return rate        target units per source unit, scaled 1e18.
    /// @return updatedAt   the oldest underlying oracle timestamp used.
    /// @return observation source-defined provenance that lets anyone replay the
    ///                     read (for Chainlink: (roundIdBase << 80) | roundIdQuote).
    function getRate(address sourceAsset, address targetAsset)
        external
        view
        returns (uint256 rate, uint64 updatedAt, bytes32 observation);

    /// @notice True if this source can quote the pair.
    function isSupported(address sourceAsset, address targetAsset) external view returns (bool);
}
