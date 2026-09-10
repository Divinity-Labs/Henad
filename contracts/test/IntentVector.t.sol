// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test, console2} from "forge-std/Test.sol";
import {PayoutIntent} from "../src/PayoutIntent.sol";

contract VectorHarness is PayoutIntent {}

/// Prints a cross-language vector consumed by packages/core/test/intent.test.ts.
contract IntentVectorTest is Test {
    function test_printVector() public {
        VectorHarness h = new VectorHarness();
        PayoutIntent.Intent memory i = PayoutIntent.Intent({
            payer: 0x1111111111111111111111111111111111111111,
            recipient: 0x2222222222222222222222222222222222222222,
            sourceAsset: 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,
            targetAsset: 0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1,
            sourceAmount: 100_000_000,
            quotedAmountOut: 73_900_000_000_000_000_000,
            toleranceBps: 50,
            maxSpreadBps: 100,
            deadline: 1_789_000_000,
            salt: bytes32(uint256(0xabcdef))
        });
        console2.log("chainId", block.chainid);
        console2.log("verifyingContract", address(h));
        console2.logBytes32(h.hashIntent(i));
    }
}
