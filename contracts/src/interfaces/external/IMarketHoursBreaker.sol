// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IMarketHoursBreaker
/// @notice Mento's FX market-hours breaker. On Monad mainnet
///         (0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF) it is pure and hard-coded:
///         closed Fri >= 21:00 UTC through Sun < 23:00 UTC, all day Dec 25 and
///         Jan 1, and Dec 24 / Dec 31 from 22:00 UTC. Being pure, it can be asked
///         about future timestamps to show the next open/close in the UI.
interface IMarketHoursBreaker {
    function isFXMarketOpen(uint256 timestamp) external pure returns (bool);
}
