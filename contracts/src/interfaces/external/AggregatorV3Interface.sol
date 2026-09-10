// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title AggregatorV3Interface
/// @notice Chainlink Data Feed proxy (EACAggregatorProxy). On Monad mainnet the
///         proxies have accessController() == 0, so contracts may read them
///         (docs/INTEGRATION-FACTS.md §14.3). roundId = (phaseId << 64) | aggregatorRoundId.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
