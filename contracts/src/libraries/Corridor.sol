// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title Corridor
/// @notice Identifier scheme for currency corridors and the spread arithmetic that
///         every receipt uses. Designed so a corridor that does not exist on Monad
///         yet (e.g. USD/NGN) needs no code change: it is just a new bytes32 id and
///         a rate source registered for it.
library Corridor {
    uint8 internal constant RATE_DECIMALS = 18;
    uint256 internal constant ONE = 1e18;
    int256 internal constant BPS = 10_000;

    /// @notice keccak256 of the ISO-4217 pair, e.g. id("USD", "GBP") == keccak256("USD/GBP").
    function id(string memory source, string memory target) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(source, "/", target));
    }

    /// @notice Executed rate in 1e18 fixed point from raw amounts and token decimals.
    /// @dev executed = (delivered / 10^targetDec) / (source / 10^sourceDec), scaled by 1e18.
    function executedRate(
        uint256 sourceAmount,
        uint8 sourceDecimals,
        uint256 deliveredAmount,
        uint8 targetDecimals
    ) internal pure returns (uint256) {
        require(sourceAmount != 0, "Corridor: zero source");
        // delivered * 1e18 * 10^sourceDec / (source * 10^targetDec)
        return (deliveredAmount * ONE * (10 ** sourceDecimals)) / (sourceAmount * (10 ** targetDecimals));
    }

    /// @notice Spread in basis points, signed. Positive means the sender received a
    ///         worse rate than the reference; negative means better.
    /// @dev spread = (reference - executed) / reference * 10_000
    function spreadBps(uint256 referenceRate, uint256 executed) internal pure returns (int256) {
        require(referenceRate != 0, "Corridor: zero reference");
        int256 diff = int256(referenceRate) - int256(executed);
        return (diff * BPS) / int256(referenceRate);
    }
}
