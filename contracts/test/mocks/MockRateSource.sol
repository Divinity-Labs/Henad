// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IRateSource} from "../../src/interfaces/IRateSource.sol";

/// @title MockRateSource
/// @notice Settable IRateSource for router unit tests: one global (rate, updatedAt,
///         observation), a per-pair support flag, and a switch that makes `getRate`
///         revert `StaleReferenceRate` the way ChainlinkRateSource would.
contract MockRateSource is IRateSource {
    uint256 public rate;
    uint64 public updatedAt;
    bytes32 public observation;
    bool public revertStale;

    mapping(address => mapping(address => bool)) private _supported;

    uint256 public constant MAX_AGE = 600;

    function setRate(uint256 rate_, uint64 updatedAt_, bytes32 observation_) external {
        rate = rate_;
        updatedAt = updatedAt_;
        observation = observation_;
    }

    function setSupported(address sourceAsset, address targetAsset, bool supported) external {
        _supported[sourceAsset][targetAsset] = supported;
    }

    function setRevertStale(bool on) external {
        revertStale = on;
    }

    function RATE_DECIMALS() external pure returns (uint8) {
        return 18;
    }

    function name() external pure returns (string memory) {
        return "mock:rate-source";
    }

    function getRate(address sourceAsset, address targetAsset) external view returns (uint256, uint64, bytes32) {
        if (!_supported[sourceAsset][targetAsset]) revert UnsupportedPair(sourceAsset, targetAsset);
        if (revertStale) revert StaleReferenceRate(address(this), updatedAt, MAX_AGE);
        return (rate, updatedAt, observation);
    }

    function isSupported(address sourceAsset, address targetAsset) external view returns (bool) {
        return _supported[sourceAsset][targetAsset];
    }
}
