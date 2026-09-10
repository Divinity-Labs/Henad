// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IRateSource
/// @notice A named, addressable source of a reference exchange rate for a corridor.
/// @dev Henad never sets rates. Every implementation reads an on-chain oracle
///      (e.g. a Chainlink AggregatorV3 proxy on Monad) and reports where the number
///      came from, so a receipt can name its source. Rates are fixed-point with
///      `RATE_DECIMALS` decimals, quoted as units of target currency per one unit
///      of source currency (e.g. USD→GBP ≈ 0.78e18).
interface IRateSource {
    /// @notice Fixed-point scale used by every rate returned from this interface.
    function RATE_DECIMALS() external pure returns (uint8);

    /// @notice Human-readable label, e.g. "chainlink:GBP/USD" or "mento:SortedOracles".
    function name() external view returns (string memory);

    /// @notice Latest reference rate for a corridor.
    /// @param corridor keccak256 of the ISO-4217 pair string, e.g. keccak256("USD/GBP").
    /// @return rate      target units per source unit, scaled by 10**RATE_DECIMALS.
    /// @return updatedAt timestamp the underlying oracle last updated.
    /// @return source    the address the rate was read from (e.g. the Chainlink proxy),
    ///                   recorded verbatim in the receipt.
    function getRate(bytes32 corridor)
        external
        view
        returns (uint256 rate, uint64 updatedAt, address source);

    /// @notice True if this source can quote the corridor.
    function isSupported(bytes32 corridor) external view returns (bool);
}
