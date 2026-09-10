// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {PayoutIntent} from "../src/PayoutIntent.sol";

/// Concrete harness exposing the internal hooks.
contract IntentHarness is PayoutIntent {
    function requireOpen(Intent calldata intent) external view {
        _requireOpen(intent, hashIntent(intent));
    }

    function markFilled(Intent calldata intent) external {
        _markFilled(hashIntent(intent));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}

contract PayoutIntentTest is Test {
    IntentHarness internal h;
    address internal payer = makeAddr("payer");
    address internal recipient = makeAddr("recipient");
    address internal ausd = makeAddr("AUSD");
    address internal gbpm = makeAddr("GBPm");

    function setUp() public {
        h = new IntentHarness();
        vm.warp(1_789_000_000);
    }

    function _intent() internal view returns (PayoutIntent.Intent memory i) {
        i = PayoutIntent.Intent({
            payer: payer,
            recipient: recipient,
            sourceAsset: ausd,
            targetAsset: gbpm,
            sourceAmount: 100e6,
            quotedAmountOut: 74e18,
            toleranceBps: 50,
            maxSpreadBps: 100,
            deadline: uint64(block.timestamp + 600),
            salt: bytes32(uint256(1))
        });
    }

    function test_typehash_matchesStruct() public view {
        assertEq(
            h.INTENT_TYPEHASH(),
            keccak256(
                "Intent(address payer,address recipient,address sourceAsset,address targetAsset,uint256 sourceAmount,uint256 quotedAmountOut,uint16 toleranceBps,uint16 maxSpreadBps,uint64 deadline,bytes32 salt)"
            )
        );
    }

    /// Recompute the EIP-712 hash by hand so a client implementation has a vector.
    function test_hashIntent_matchesManualEip712() public view {
        PayoutIntent.Intent memory i = _intent();
        bytes32 structHash = keccak256(
            abi.encode(
                h.INTENT_TYPEHASH(),
                i.payer,
                i.recipient,
                i.sourceAsset,
                i.targetAsset,
                i.sourceAmount,
                i.quotedAmountOut,
                i.toleranceBps,
                i.maxSpreadBps,
                i.deadline,
                i.salt
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", h.domainSeparator(), structHash));
        assertEq(h.hashIntent(i), expected);
    }

    function test_domain_isHenadV1BoundToThisChainAndContract() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Henad"),
                keccak256("1"),
                block.chainid,
                address(h)
            )
        );
        assertEq(h.domainSeparator(), expected);
    }

    function test_hash_changesWithEveryField() public view {
        PayoutIntent.Intent memory base = _intent();
        bytes32 h0 = h.hashIntent(base);
        PayoutIntent.Intent memory m;

        m = base; m.recipient = address(1); assertTrue(h.hashIntent(m) != h0, "recipient");
        m = base; m.sourceAmount += 1; assertTrue(h.hashIntent(m) != h0, "sourceAmount");
        m = base; m.quotedAmountOut += 1; assertTrue(h.hashIntent(m) != h0, "quotedAmountOut");
        m = base; m.toleranceBps += 1; assertTrue(h.hashIntent(m) != h0, "toleranceBps");
        m = base; m.maxSpreadBps += 1; assertTrue(h.hashIntent(m) != h0, "maxSpreadBps");
        m = base; m.deadline += 1; assertTrue(h.hashIntent(m) != h0, "deadline");
        m = base; m.salt = bytes32(uint256(2)); assertTrue(h.hashIntent(m) != h0, "salt");
        m = base; m.targetAsset = address(2); assertTrue(h.hashIntent(m) != h0, "targetAsset");
    }

    function test_minAmountOut() public view {
        PayoutIntent.Intent memory i = _intent();
        assertEq(h.minAmountOut(i), 74e18 * 9950 / 10000);
        i.toleranceBps = 0;
        assertEq(h.minAmountOut(i), 74e18);
    }

    function testFuzz_minAmountOut_neverExceedsQuote(uint256 quote, uint16 tol) public view {
        quote = bound(quote, 0, type(uint128).max);
        tol = uint16(bound(tol, 0, 9999));
        PayoutIntent.Intent memory i = _intent();
        i.quotedAmountOut = quote;
        i.toleranceBps = tol;
        uint256 m = h.minAmountOut(i);
        assertLe(m, quote);
        assertGe(m, quote * (10000 - tol) / 10000);
    }

    function test_requireOpen_passesForFreshIntent() public view {
        h.requireOpen(_intent());
    }

    function test_requireOpen_rejectsExpired() public {
        PayoutIntent.Intent memory i = _intent();
        vm.warp(i.deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.IntentExpired.selector, h.hashIntent(i), i.deadline));
        h.requireOpen(i);
    }

    function test_requireOpen_acceptsAtDeadline() public {
        PayoutIntent.Intent memory i = _intent();
        vm.warp(i.deadline);
        h.requireOpen(i);
    }

    function test_requireOpen_rejectsMalformed() public {
        PayoutIntent.Intent memory i;

        i = _intent(); i.recipient = address(0);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.InvalidIntent.selector, "recipient"));
        h.requireOpen(i);

        i = _intent(); i.sourceAmount = 0;
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.InvalidIntent.selector, "sourceAmount"));
        h.requireOpen(i);

        i = _intent(); i.quotedAmountOut = 0;
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.InvalidIntent.selector, "quotedAmountOut"));
        h.requireOpen(i);

        i = _intent(); i.toleranceBps = 10_000;
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.InvalidIntent.selector, "toleranceBps"));
        h.requireOpen(i);

        i = _intent(); i.targetAsset = i.sourceAsset;
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.InvalidIntent.selector, "sameAsset"));
        h.requireOpen(i);
    }

    function test_lifecycle_filledThenNotOpen() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = h.hashIntent(i);
        assertEq(uint8(h.intentStatus(id)), uint8(PayoutIntent.Status.None));
        h.markFilled(i);
        assertEq(uint8(h.intentStatus(id)), uint8(PayoutIntent.Status.Filled));
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Filled));
        h.requireOpen(i);
        // cannot cancel a filled intent either
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Filled));
        h.cancel(i);
    }

    function test_cancel_onlyPayer() public {
        PayoutIntent.Intent memory i = _intent();
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.NotPayer.selector, address(this), payer));
        h.cancel(i);
    }

    function test_cancel_marksCancelledAndEmits() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = h.hashIntent(i);
        vm.expectEmit(true, true, false, false, address(h));
        emit PayoutIntent.IntentCancelled(id, payer);
        vm.prank(payer);
        h.cancel(i);
        assertEq(uint8(h.intentStatus(id)), uint8(PayoutIntent.Status.Cancelled));
        vm.expectRevert(
            abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Cancelled)
        );
        h.requireOpen(i);
    }
}
