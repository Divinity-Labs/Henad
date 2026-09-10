// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IVenueAdapter} from "../../src/interfaces/IVenueAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title MockVenue
/// @notice Settable IVenueAdapter for router unit tests. `swap` checks that the
///         router really funded it with `amountIn`, records every argument, MINTS
///         `deliverOut` of the target token to the recipient (so the router's
///         balance-delta logic is exercised), and returns either that amount or an
///         override, so a lying venue can be simulated. It deliberately does NOT
///         enforce `minAmountOut`; the router's own `InsufficientDelivery` must.
contract MockVenue is IVenueAdapter {
    error SwapReverted();
    error QuoteReverted();
    error StatusReverted();
    error AmountInNotReceived(uint256 have, uint256 want);

    uint256 public quoteOut;
    uint256 public deliverOut;
    uint256 public reportOut;
    bool public useReportOverride;
    Status public currentStatus; // default Open (enum 0)
    bool public revertOnSwap;
    bool public revertOnQuote;
    bool public revertOnStatus;

    address public lastAssetIn;
    address public lastAssetOut;
    uint256 public lastAmountIn;
    uint256 public lastMinOut;
    address public lastRecipient;
    uint256 public swapCount;

    function setQuote(uint256 amountOut) external {
        quoteOut = amountOut;
    }

    function setDelivered(uint256 amountOut) external {
        deliverOut = amountOut;
    }

    /// @notice Make `swap` return `amountOut` regardless of what it actually delivered.
    function setReported(uint256 amountOut) external {
        reportOut = amountOut;
        useReportOverride = true;
    }

    function setStatus(Status s) external {
        currentStatus = s;
    }

    function setRevertOnSwap(bool on) external {
        revertOnSwap = on;
    }

    function setRevertOnQuote(bool on) external {
        revertOnQuote = on;
    }

    function setRevertOnStatus(bool on) external {
        revertOnStatus = on;
    }

    function name() external pure returns (string memory) {
        return "mock:venue";
    }

    function status(address, address) external view returns (Status) {
        if (revertOnStatus) revert StatusReverted();
        return currentStatus;
    }

    function quote(address, address, uint256) external view returns (uint256) {
        if (revertOnQuote) revert QuoteReverted();
        return quoteOut;
    }

    function swap(address assetIn, address assetOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        virtual
        returns (uint256)
    {
        if (revertOnSwap) revert SwapReverted();
        uint256 have = IERC20(assetIn).balanceOf(address(this));
        if (have < amountIn) revert AmountInNotReceived(have, amountIn);

        lastAssetIn = assetIn;
        lastAssetOut = assetOut;
        lastAmountIn = amountIn;
        lastMinOut = minAmountOut;
        lastRecipient = recipient;
        ++swapCount;

        MockERC20(assetOut).mint(recipient, deliverOut);
        return useReportOverride ? reportOut : deliverOut;
    }
}

/// @title ReentrantVenue
/// @notice MockVenue that, during `swap`, calls back into an arbitrary target with
///         arbitrary calldata and bubbles any revert. Used to prove the router's
///         transient reentrancy guard blocks re-entry through either entry point.
contract ReentrantVenue is MockVenue {
    address public reentryTarget;
    bytes public reentryData;

    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function swap(address assetIn, address assetOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        override
        returns (uint256)
    {
        if (revertOnSwap) revert SwapReverted();
        uint256 have = IERC20(assetIn).balanceOf(address(this));
        if (have < amountIn) revert AmountInNotReceived(have, amountIn);

        lastAssetIn = assetIn;
        lastAssetOut = assetOut;
        lastAmountIn = amountIn;
        lastMinOut = minAmountOut;
        lastRecipient = recipient;
        ++swapCount;
        MockERC20(assetOut).mint(recipient, deliverOut);

        if (reentryData.length != 0) {
            // bubbles the revert data of the inner call unchanged
            Address.functionCall(reentryTarget, reentryData);
        }
        return deliverOut;
    }
}
