// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {RateAttestation} from "../src/RateAttestation.sol";
import {IRateAttestation} from "../src/interfaces/IRateAttestation.sol";

contract RateAttestationTest is Test {
    RateAttestation internal att;
    address internal router = makeAddr("router");
    address internal payer = makeAddr("payer");
    address internal recipient = makeAddr("recipient");
    address internal ausd = makeAddr("AUSD");
    address internal gbpm = makeAddr("GBPm");
    address internal rateSource = makeAddr("rateSource");
    address internal venue = makeAddr("venue");

    function setUp() public {
        att = new RateAttestation(router);
    }

    function _sample() internal view returns (IRateAttestation.Attestation memory a) {
        a = IRateAttestation.Attestation({
            corridor: keccak256("USD/GBP"),
            referenceObservation: bytes32(uint256(0xabc)),
            referenceRate: 0.74e18,
            executedRate: 0.7386e18,
            sourceAmount: 100e6,
            deliveredAmount: 73.86e18,
            rateSource: rateSource,
            spreadBps: 19,
            settledAt: uint64(block.timestamp),
            venue: venue,
            settledAtBlock: uint64(block.number)
        });
    }

    function test_constructor_rejectsZeroRouter() public {
        vm.expectRevert(RateAttestation.ZeroAddress.selector);
        new RateAttestation(address(0));
    }

    function test_onlyRouterCanAttest() public {
        vm.expectRevert(abi.encodeWithSelector(IRateAttestation.NotRouter.selector, address(this)));
        att.attest(bytes32(uint256(1)), _sample(), payer, recipient, ausd, gbpm);
    }

    function test_attest_storesAndEmits() public {
        IRateAttestation.Attestation memory a = _sample();
        bytes32 id = keccak256("intent-1");

        vm.expectEmit(true, true, true, true, address(att));
        emit IRateAttestation.PayoutSettled(id, a.corridor, payer, recipient, ausd, gbpm, a);
        vm.prank(router);
        att.attest(id, a, payer, recipient, ausd, gbpm);

        IRateAttestation.Attestation memory r = att.get(id);
        assertEq(r.corridor, a.corridor);
        assertEq(r.referenceObservation, a.referenceObservation);
        assertEq(r.referenceRate, a.referenceRate);
        assertEq(r.executedRate, a.executedRate);
        assertEq(r.sourceAmount, a.sourceAmount);
        assertEq(r.deliveredAmount, a.deliveredAmount);
        assertEq(r.rateSource, a.rateSource);
        assertEq(r.spreadBps, a.spreadBps);
        assertEq(r.settledAt, a.settledAt);
        assertEq(r.venue, a.venue);
        assertEq(r.settledAtBlock, a.settledAtBlock);
        assertEq(att.count(), 1);
    }

    function test_attest_isWriteOnce() public {
        bytes32 id = keccak256("intent-2");
        vm.startPrank(router);
        att.attest(id, _sample(), payer, recipient, ausd, gbpm);
        vm.expectRevert(abi.encodeWithSelector(IRateAttestation.AlreadyAttested.selector, id));
        att.attest(id, _sample(), payer, recipient, ausd, gbpm);
        vm.stopPrank();
        assertEq(att.count(), 1);
    }

    function test_attest_rejectsZeroSettledAt() public {
        IRateAttestation.Attestation memory a = _sample();
        a.settledAt = 0;
        vm.prank(router);
        vm.expectRevert(IRateAttestation.ValueOverflow.selector);
        att.attest(keccak256("intent-3"), a, payer, recipient, ausd, gbpm);
    }

    function test_get_unknownIsEmpty() public view {
        IRateAttestation.Attestation memory r = att.get(keccak256("nope"));
        assertEq(r.settledAt, 0);
        assertEq(r.referenceRate, 0);
    }

    /// The packed struct must round-trip every field for arbitrary values.
    function testFuzz_roundTrip(
        bytes32 corridor,
        bytes32 obs,
        uint128 refRate,
        uint128 execRate,
        uint128 srcAmt,
        uint128 delAmt,
        int32 spread,
        uint64 settledAt,
        uint64 blockNo
    ) public {
        vm.assume(settledAt != 0);
        IRateAttestation.Attestation memory a = IRateAttestation.Attestation({
            corridor: corridor,
            referenceObservation: obs,
            referenceRate: refRate,
            executedRate: execRate,
            sourceAmount: srcAmt,
            deliveredAmount: delAmt,
            rateSource: rateSource,
            spreadBps: spread,
            settledAt: settledAt,
            venue: venue,
            settledAtBlock: blockNo
        });
        bytes32 id = keccak256(abi.encode(corridor, obs, refRate));
        vm.prank(router);
        att.attest(id, a, payer, recipient, ausd, gbpm);
        IRateAttestation.Attestation memory r = att.get(id);
        assertEq(keccak256(abi.encode(r)), keccak256(abi.encode(a)));
    }
}
