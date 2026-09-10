// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {AggregatorV3Interface} from "../../src/interfaces/external/AggregatorV3Interface.sol";

/// @title MockAggregator
/// @notice Settable stand-in for a Chainlink EACAggregatorProxy. Every round written
///         with `setRound` is kept so `getRoundData` can replay it, and `decimals`
///         can be changed after construction to prove the rate source stores them once.
contract MockAggregator is AggregatorV3Interface {
    struct Round {
        int256 answer;
        uint256 updatedAt;
        bool exists;
    }

    uint8 public decimals;
    string public description;
    uint80 public latestRoundId;
    mapping(uint80 roundId => Round) private _rounds;

    /// @dev Mirrors the real proxy, which reverts "No data present" for an unknown round.
    error NoData(uint80 roundId);

    constructor(uint8 decimals_, string memory description_) {
        decimals = decimals_;
        description = description_;
    }

    function setDecimals(uint8 decimals_) external {
        decimals = decimals_;
    }

    /// @notice Record a round and make it the latest. `startedAt` mirrors `updatedAt`
    ///         and `answeredInRound` mirrors `roundId`, as on a healthy live feed.
    function setRound(uint80 roundId, int256 answer, uint256 updatedAt) external {
        _rounds[roundId] = Round({answer: answer, updatedAt: updatedAt, exists: true});
        latestRoundId = roundId;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return _round(latestRoundId);
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return _round(_roundId);
    }

    function _round(uint80 id)
        private
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        Round storage r = _rounds[id];
        if (!r.exists) revert NoData(id);
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}
