// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {Corridor} from "../src/libraries/Corridor.sol";

contract CorridorTest is Test {
    function test_id_matchesKeccakOfPair() public pure {
        assertEq(Corridor.id("USD", "GBP"), keccak256("USD/GBP"));
        assertTrue(Corridor.id("USD", "GBP") != Corridor.id("GBP", "USD"));
    }

    /// 100 AUSD (6 dec) -> 78 GBPm (18 dec) is a rate of 0.78e18.
    function test_executedRate_mixedDecimals() public pure {
        uint256 rate = Corridor.executedRate(100e6, 6, 78e18, 18);
        assertEq(rate, 0.78e18);
    }

    function test_spreadBps_signs() public pure {
        // referenceRate 0.80, executed 0.78 -> sender lost 2.5% -> +250 bps
        assertEq(Corridor.spreadBps(0.80e18, 0.78e18), 250);
        // executed better than referenceRate -> negative
        assertEq(Corridor.spreadBps(0.78e18, 0.80e18), -256);
        assertEq(Corridor.spreadBps(1e18, 1e18), 0);
    }

    function test_executedRate_revertsOnZeroSource() public {
        vm.expectRevert(bytes("Corridor: zero source"));
        this.callExecuted(0, 6, 1, 18);
    }

    function test_spreadBps_revertsOnZeroReference() public {
        vm.expectRevert(bytes("Corridor: zero reference"));
        this.callSpread(0, 1);
    }

    /// Spread is bounded: executed in [0, 2*referenceRate] gives bps in [-10_000, 10_000].
    function testFuzz_spreadBps_bounded(uint256 referenceRate, uint256 executed) public pure {
        referenceRate = bound(referenceRate, 1, 1e30);
        executed = bound(executed, 0, 2 * referenceRate);
        int256 bps = Corridor.spreadBps(referenceRate, executed);
        assertGe(bps, -10_000);
        assertLe(bps, 10_000);
    }

    /// Executed == referenceRate is always zero spread.
    function testFuzz_spreadBps_zeroAtReference(uint256 referenceRate) public pure {
        referenceRate = bound(referenceRate, 1, 1e30);
        assertEq(Corridor.spreadBps(referenceRate, referenceRate), 0);
    }

    /// Round-trip: rate computed from amounts reproduces delivered amount within rounding.
    function testFuzz_executedRate_roundTrip(uint256 sourceAmount, uint256 delivered) public pure {
        sourceAmount = bound(sourceAmount, 1, 1e12);   // up to 1M AUSD at 6 dec
        delivered = bound(delivered, 0, 1e30);
        uint256 rate = Corridor.executedRate(sourceAmount, 6, delivered, 18);
        // delivered' = rate * source / 1e18 * 10^18 / 10^6
        uint256 back = (rate * sourceAmount * 1e18) / (1e18 * 1e6);
        // within one unit of source-side rounding
        assertApproxEqAbs(back, delivered, 1e12);
    }

    function callExecuted(uint256 a, uint8 b, uint256 c, uint8 d) external pure returns (uint256) {
        return Corridor.executedRate(a, b, c, d);
    }

    function callSpread(uint256 a, uint256 b) external pure returns (int256) {
        return Corridor.spreadBps(a, b);
    }
}
