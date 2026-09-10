// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {CorridorRouter} from "../src/CorridorRouter.sol";
import {PayoutIntent} from "../src/PayoutIntent.sol";
import {RateAttestation} from "../src/RateAttestation.sol";
import {IRateAttestation} from "../src/interfaces/IRateAttestation.sol";
import {IRateSource} from "../src/interfaces/IRateSource.sol";
import {IVenueAdapter} from "../src/interfaces/IVenueAdapter.sol";
import {Corridor} from "../src/libraries/Corridor.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC3009Token} from "./mocks/MockERC3009Token.sol";
import {MockRateSource} from "./mocks/MockRateSource.sol";
import {MockVenue, ReentrantVenue} from "./mocks/MockVenue.sol";

/// Unit tests for CorridorRouter with mocks, covering both settlement paths:
///   path A  settleWithAuthorization (relayer submits the payer's ERC-3009 signature)
///   path B  settle                  (payer is msg.sender and has approved)
contract CorridorRouterTest is Test {
    // --- vectors -----------------------------------------------------------
    uint256 internal constant REF = 0.74e18; // reference: 0.74 GBP per AUSD
    uint256 internal constant SOURCE = 100e6; // 100 AUSD (6 dec)
    // delivered 73.8594 GBPm -> executed 0.738594 -> spread (0.74 - 0.738594)/0.74 = exactly 19 bps
    uint256 internal constant QUOTE = 73.8594e18;
    uint256 internal constant EXECUTED_19BPS = 0.738594e18;
    uint16 internal constant TOL = 50; // minOut = 73.490103e18
    uint16 internal constant MAX_SPREAD = 50;
    bytes32 internal constant OBS = bytes32((uint256(0x1234) << 80) | 0x5678);
    bytes32 internal constant CORRIDOR = keccak256("USD/GBP");

    uint256 internal constant T0 = 1_789_000_000;
    uint256 internal constant B0 = 103_629_140;

    // --- actors ------------------------------------------------------------
    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    address internal recipient = makeAddr("recipient");
    uint256 internal payerKey = 0xA11CE;
    address internal payer = vm.addr(payerKey);
    uint256 internal strangerKey = 0xB0B;

    // --- system ------------------------------------------------------------
    MockERC3009Token internal ausd;
    MockERC20 internal gbpm;
    MockERC20 internal eurm;
    MockRateSource internal rateSource;
    MockVenue internal venue;
    RateAttestation internal attestation;
    CorridorRouter internal router;

    function setUp() public {
        vm.warp(T0);
        vm.roll(B0);

        ausd = new MockERC3009Token("Mock AUSD", "mAUSD", 6);
        gbpm = new MockERC20("Mock GBPm", "mGBPm", 18);
        eurm = new MockERC20("Mock EURm", "mEURm", 18);
        rateSource = new MockRateSource();
        venue = new MockVenue();

        rateSource.setSupported(address(ausd), address(gbpm), true);
        rateSource.setRate(REF, uint64(block.timestamp - 30), OBS);
        venue.setQuote(QUOTE);
        venue.setDelivered(QUOTE);

        // Exactly what script/Deploy.s.sol will do: predict the router's CREATE
        // address one nonce ahead, deploy the attestation bound to it, then the router.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        attestation = new RateAttestation(predicted);
        router = new CorridorRouter(owner, attestation);
        assertEq(address(router), predicted, "CREATE prediction");

        vm.prank(owner);
        router.registerCorridor(address(ausd), address(gbpm), CORRIDOR, rateSource, venue);

        ausd.mint(payer, 1_000e6);
        vm.prank(payer);
        ausd.approve(address(router), type(uint256).max);
    }

    // =========================================================================
    // helpers
    // =========================================================================

    function _intent() internal view returns (PayoutIntent.Intent memory i) {
        i = PayoutIntent.Intent({
            payer: payer,
            recipient: recipient,
            sourceAsset: address(ausd),
            targetAsset: address(gbpm),
            sourceAmount: SOURCE,
            quotedAmountOut: QUOTE,
            toleranceBps: TOL,
            maxSpreadBps: MAX_SPREAD,
            deadline: uint64(block.timestamp + 600),
            salt: bytes32(uint256(1))
        });
    }

    /// ERC-3009 ReceiveWithAuthorization signature exactly as the relayer client will build it.
    function _signAuth(uint256 key, PayoutIntent.Intent memory i, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                ausd.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                i.payer,
                address(router),
                i.sourceAmount,
                uint256(0),
                uint256(i.deadline),
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sig(PayoutIntent.Intent memory i) internal view returns (bytes memory) {
        return _signAuth(payerKey, i, router.hashIntent(i));
    }

    function _signCancel(uint256 key, address authorizer, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(ausd.CANCEL_AUTHORIZATION_TYPEHASH(), authorizer, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _settleVia(bool pathA, PayoutIntent.Intent memory i) internal returns (uint256) {
        if (pathA) {
            bytes memory sig = _sig(i);
            vm.prank(relayer);
            return router.settleWithAuthorization(i, sig);
        }
        vm.prank(payer);
        return router.settle(i);
    }

    function _expectRevertVia(bool pathA, PayoutIntent.Intent memory i, bytes memory err) internal {
        if (pathA) {
            bytes memory sig = _sig(i);
            vm.prank(relayer);
            vm.expectRevert(err);
            router.settleWithAuthorization(i, sig);
        } else {
            vm.prank(payer);
            vm.expectRevert(err);
            router.settle(i);
        }
    }

    function _expectedReceipt(uint256 delivered, int32 spread)
        internal
        view
        returns (IRateAttestation.Attestation memory)
    {
        return IRateAttestation.Attestation({
            corridor: CORRIDOR,
            referenceObservation: OBS,
            referenceRate: uint128(REF),
            executedRate: uint128(Corridor.executedRate(SOURCE, 6, delivered, 18)),
            sourceAmount: uint128(SOURCE),
            deliveredAmount: uint128(delivered),
            rateSource: address(rateSource),
            spreadBps: spread,
            settledAt: uint64(block.timestamp),
            venue: address(venue),
            settledAtBlock: uint64(block.number)
        });
    }

    function _assertReceipt(bytes32 id, IRateAttestation.Attestation memory e) internal view {
        IRateAttestation.Attestation memory r = attestation.get(id);
        assertEq(r.corridor, e.corridor, "corridor");
        assertEq(r.referenceObservation, e.referenceObservation, "observation");
        assertEq(r.referenceRate, e.referenceRate, "referenceRate");
        assertEq(r.executedRate, e.executedRate, "executedRate");
        assertEq(r.sourceAmount, e.sourceAmount, "sourceAmount");
        assertEq(r.deliveredAmount, e.deliveredAmount, "deliveredAmount");
        assertEq(r.rateSource, e.rateSource, "rateSource");
        assertEq(r.spreadBps, e.spreadBps, "spreadBps");
        assertEq(r.settledAt, e.settledAt, "settledAt");
        assertEq(r.venue, e.venue, "venue");
        assertEq(r.settledAtBlock, e.settledAtBlock, "settledAtBlock");
    }

    // =========================================================================
    // construction and wiring
    // =========================================================================

    function test_wiring_attestationBoundToRouter() public view {
        assertEq(attestation.router(), address(router));
        assertEq(address(router.attestation()), address(attestation));
        assertEq(router.owner(), owner);
    }

    /// The zero check runs before the binding check, so a zero attestation is still
    /// `ZeroAddress` rather than a failed `router()` staticcall.
    function test_constructor_rejectsZeroAttestation() public {
        vm.expectRevert(CorridorRouter.ZeroAddress.selector);
        new CorridorRouter(owner, IRateAttestation(address(0)));
    }

    /// Ownable's base constructor runs before the router's body, so a zero owner is
    /// reported as `OwnableInvalidOwner` even though `attestation` is bound elsewhere.
    function test_constructor_rejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new CorridorRouter(address(0), attestation);
    }

    /// A mispredicted CREATE nonce must fail on deploy, not on the first settlement.
    /// Off-by-one prediction: the attestation is bound to nonce+2 while the router
    /// lands at nonce+1.
    function test_constructor_rejectsMispredictedCreateNonce() public {
        address mispredicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        RateAttestation misbound = new RateAttestation(mispredicted);
        assertTrue(misbound.router() != vm.computeCreateAddress(address(this), vm.getNonce(address(this))), "setup");

        vm.expectRevert(CorridorRouter.AttestationMisbound.selector);
        new CorridorRouter(owner, misbound);
    }

    /// The corollary: a receipt store already bound to a live router can never back a
    /// second one, so the pair is always one-to-one.
    function test_constructor_rejectsAttestationBoundToAnotherRouter() public {
        assertEq(attestation.router(), address(router), "setup");
        vm.expectRevert(CorridorRouter.AttestationMisbound.selector);
        new CorridorRouter(owner, attestation);
    }

    // =========================================================================
    // registerCorridor
    // =========================================================================

    function test_registerCorridor_storesConfigAndEmits() public {
        (bytes32 corridor, IRateSource rs, IVenueAdapter v, uint8 srcDec, uint8 dstDec) =
            router.corridors(address(ausd), address(gbpm));
        assertEq(corridor, CORRIDOR);
        assertEq(address(rs), address(rateSource));
        assertEq(address(v), address(venue));
        assertEq(srcDec, 6, "decimals read from the source token");
        assertEq(dstDec, 18, "decimals read from the target token");

        // a second pair on the same venue/rate source, checking the event
        rateSource.setSupported(address(ausd), address(eurm), true);
        vm.expectEmit(true, true, true, true, address(router));
        emit CorridorRouter.CorridorRegistered(
            address(ausd), address(eurm), keccak256("USD/EUR"), address(rateSource), address(venue)
        );
        vm.prank(owner);
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, venue);
    }

    function test_registerCorridor_onlyOwner() public {
        rateSource.setSupported(address(ausd), address(eurm), true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, venue);
    }

    function test_registerCorridor_duplicateReverts() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(CorridorRouter.CorridorAlreadyRegistered.selector, address(ausd), address(gbpm))
        );
        router.registerCorridor(address(ausd), address(gbpm), CORRIDOR, rateSource, venue);

        // ...even with different parameters: the owner cannot change a corridor
        MockVenue other = new MockVenue();
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(CorridorRouter.CorridorAlreadyRegistered.selector, address(ausd), address(gbpm))
        );
        router.registerCorridor(address(ausd), address(gbpm), keccak256("other"), rateSource, other);
    }

    function test_registerCorridor_rejectsUnsupportedRateSource() public {
        // (ausd, eurm) never marked supported on the mock
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRateSource.UnsupportedPair.selector, address(ausd), address(eurm)));
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, venue);
    }

    function test_registerCorridor_rejectsVenueNoRoute() public {
        rateSource.setSupported(address(ausd), address(eurm), true);
        MockVenue noRoute = new MockVenue();
        noRoute.setStatus(IVenueAdapter.Status.NoRoute);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IVenueAdapter.NoRoute.selector, address(ausd), address(eurm)));
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, noRoute);
    }

    /// A non-Open, non-NoRoute status (e.g. weekend MarketClosed) must not block registration.
    function test_registerCorridor_acceptsMarketClosedVenue() public {
        rateSource.setSupported(address(ausd), address(eurm), true);
        MockVenue closed = new MockVenue();
        closed.setStatus(IVenueAdapter.Status.MarketClosed);
        vm.prank(owner);
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, closed);
        (,, IVenueAdapter v,,) = router.corridors(address(ausd), address(eurm));
        assertEq(address(v), address(closed));
    }

    function test_registerCorridor_rejectsZeroAddresses() public {
        vm.startPrank(owner);
        vm.expectRevert(CorridorRouter.ZeroAddress.selector);
        router.registerCorridor(address(0), address(eurm), CORRIDOR, rateSource, venue);
        vm.expectRevert(CorridorRouter.ZeroAddress.selector);
        router.registerCorridor(address(ausd), address(0), CORRIDOR, rateSource, venue);
        vm.expectRevert(CorridorRouter.ZeroAddress.selector);
        router.registerCorridor(address(ausd), address(eurm), CORRIDOR, IRateSource(address(0)), venue);
        vm.expectRevert(CorridorRouter.ZeroAddress.selector);
        router.registerCorridor(address(ausd), address(eurm), CORRIDOR, rateSource, IVenueAdapter(address(0)));
        vm.stopPrank();
    }

    /// A same-asset corridor could never settle (`_requireOpen` rejects the intent) and
    /// on Mento would route X -> USDm -> X, so it is refused at registration.
    function test_registerCorridor_rejectsSameAsset() public {
        rateSource.setSupported(address(ausd), address(ausd), true);
        vm.prank(owner);
        vm.expectRevert(CorridorRouter.SameAsset.selector);
        router.registerCorridor(address(ausd), address(ausd), keccak256("USD/USD"), rateSource, venue);
        (,, IVenueAdapter v,,) = router.corridors(address(ausd), address(ausd));
        assertEq(address(v), address(0), "nothing stored");
    }

    /// An empty corridor id would stamp every receipt for the pair with a blank
    /// identifier, which reads as "no corridor" off-chain.
    function test_registerCorridor_rejectsZeroCorridor() public {
        rateSource.setSupported(address(ausd), address(eurm), true);
        vm.prank(owner);
        vm.expectRevert(CorridorRouter.ZeroCorridor.selector);
        router.registerCorridor(address(ausd), address(eurm), bytes32(0), rateSource, venue);
        (,, IVenueAdapter v,,) = router.corridors(address(ausd), address(eurm));
        assertEq(address(v), address(0), "nothing stored");
    }

    // =========================================================================
    // happy path, both entry points
    // =========================================================================

    function _happyPath(bool pathA) internal {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        IRateAttestation.Attestation memory e = _expectedReceipt(QUOTE, 19);
        assertEq(e.executedRate, EXECUTED_19BPS, "vector");

        uint256 payerBefore = ausd.balanceOf(payer);
        uint256 recipientBefore = gbpm.balanceOf(recipient);

        vm.expectEmit(true, true, true, true, address(attestation));
        emit IRateAttestation.PayoutSettled(id, CORRIDOR, payer, recipient, address(ausd), address(gbpm), e);
        uint256 delivered = _settleVia(pathA, i);

        // amounts
        assertEq(delivered, QUOTE, "returned delivered");
        assertEq(gbpm.balanceOf(recipient) - recipientBefore, QUOTE, "recipient delta");
        assertEq(payerBefore - ausd.balanceOf(payer), SOURCE, "payer debited exactly sourceAmount");
        assertEq(ausd.balanceOf(address(router)), 0, "router keeps nothing");
        assertEq(gbpm.balanceOf(address(router)), 0, "router keeps nothing");
        assertEq(ausd.balanceOf(address(venue)), SOURCE, "venue was funded before swap");

        // venue call shape
        assertEq(venue.lastAssetIn(), address(ausd));
        assertEq(venue.lastAssetOut(), address(gbpm));
        assertEq(venue.lastAmountIn(), SOURCE);
        assertEq(venue.lastMinOut(), router.minAmountOut(i), "minOut forwarded to venue");
        assertEq(venue.lastRecipient(), recipient, "venue delivers straight to recipient");
        assertEq(venue.swapCount(), 1);

        // receipt
        _assertReceipt(id, e);
        assertEq(attestation.count(), 1);

        // lifecycle
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.Filled));
        if (pathA) assertTrue(ausd.authorizationState(payer, id), "nonce = intentId consumed at the token");
        else assertFalse(ausd.authorizationState(payer, id), "path B never touches the token nonce");
    }

    function test_settle_happyPath() public {
        _happyPath(false);
    }

    function test_settleWithAuthorization_happyPath() public {
        _happyPath(true);
    }

    function _negativeSpread(bool pathA) internal {
        // delivered 74.5 -> executed 0.745 > reference 0.74 -> (0.74-0.745)/0.74 = -67.5 -> -67 bps
        uint256 delivered = 74.5e18;
        venue.setDelivered(delivered);
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);

        _settleVia(pathA, i);

        IRateAttestation.Attestation memory e = _expectedReceipt(delivered, -67);
        assertEq(e.executedRate, 0.745e18);
        assertEq(Corridor.spreadBps(REF, 0.745e18), -67);
        _assertReceipt(id, e);
        assertEq(gbpm.balanceOf(recipient), delivered);
    }

    function test_settle_negativeSpread() public {
        _negativeSpread(false);
    }

    function test_settleWithAuthorization_negativeSpread() public {
        _negativeSpread(true);
    }

    /// Spread of exactly maxSpreadBps must pass (the check is strictly greater-than).
    function test_settle_spreadAtLimitPasses() public {
        PayoutIntent.Intent memory i = _intent();
        i.maxSpreadBps = 19;
        _settleVia(false, i);
        assertEq(attestation.get(router.hashIntent(i)).spreadBps, 19);
    }

    /// The router trusts the recipient's balance delta, never the venue's return value.
    function _usesBalanceDelta(bool pathA) internal {
        venue.setReported(QUOTE); // venue claims the full quote...
        venue.setDelivered(73e18); // ...but actually delivers less than minOut (73.490103e18)
        PayoutIntent.Intent memory i = _intent();
        _expectRevertVia(
            pathA,
            i,
            abi.encodeWithSelector(CorridorRouter.InsufficientDelivery.selector, 73e18, router.minAmountOut(i))
        );

        // and the other way round: under-reports but delivers -> receipt carries the real delta
        venue.setReported(1);
        venue.setDelivered(QUOTE);
        uint256 delivered = _settleVia(pathA, i);
        assertEq(delivered, QUOTE);
        assertEq(attestation.get(router.hashIntent(i)).deliveredAmount, QUOTE);
    }

    function test_settle_usesBalanceDeltaNotVenueReport() public {
        _usesBalanceDelta(false);
    }

    function test_settleWithAuthorization_usesBalanceDeltaNotVenueReport() public {
        _usesBalanceDelta(true);
    }

    // =========================================================================
    // lifecycle
    // =========================================================================

    function test_settle_replayRevertsIntentNotOpen() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        _settleVia(false, i);
        _expectRevertVia(
            false, i, abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Filled)
        );
        assertEq(attestation.count(), 1);
    }

    /// Path A replay: the nonce is spent at the token, so the router's early check fires.
    function test_settleWithAuthorization_replayRevertsAuthorizationUsed() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        _settleVia(true, i);
        _expectRevertVia(true, i, abi.encodeWithSelector(CorridorRouter.AuthorizationUsed.selector, id));
    }

    /// Filled via path B (token nonce untouched), then replayed via path A: the token
    /// pull succeeds but `_requireOpen` rejects, so the whole tx rolls back.
    function test_settleWithAuthorization_afterPathBFill_revertsIntentNotOpen() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        _settleVia(false, i);
        uint256 payerBefore = ausd.balanceOf(payer);
        _expectRevertVia(
            true, i, abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Filled)
        );
        assertEq(ausd.balanceOf(payer), payerBefore, "rolled back");
        assertFalse(ausd.authorizationState(payer, id), "nonce not consumed on revert");
    }

    /// Filled via path A, then replayed via path B.
    function test_settle_afterPathAFill_revertsIntentNotOpen() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        _settleVia(true, i);
        _expectRevertVia(
            false, i, abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Filled)
        );
    }

    function test_settle_cancelledIntentReverts() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        vm.prank(payer);
        router.cancel(i);
        _expectRevertVia(
            false, i, abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Cancelled)
        );
        _expectRevertVia(
            true, i, abi.encodeWithSelector(PayoutIntent.IntentNotOpen.selector, id, PayoutIntent.Status.Cancelled)
        );
    }

    function test_settle_nonPayerRevertsNotPayer() public {
        PayoutIntent.Intent memory i = _intent();
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.NotPayer.selector, relayer, payer));
        router.settle(i);

        // the owner is not special either
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.NotPayer.selector, owner, payer));
        router.settle(i);
    }

    function test_settle_expiredRevertsIntentExpired() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        vm.warp(i.deadline + 1);
        _expectRevertVia(false, i, abi.encodeWithSelector(PayoutIntent.IntentExpired.selector, id, i.deadline));
    }

    /// Path A: validBefore == deadline and the token's check is strict, so the token
    /// rejects an expired authorization before `_settle` runs (`_requireOpen` would
    /// also reject it; both errors mean the same thing to the relayer).
    function test_settleWithAuthorization_expiredRevertsAtToken() public {
        PayoutIntent.Intent memory i = _intent();
        bytes memory sig = _sig(i);
        vm.warp(i.deadline);
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.AuthorizationExpired.selector);
        router.settleWithAuthorization(i, sig);
    }

    function test_settle_unregisteredCorridorReverts() public {
        PayoutIntent.Intent memory i = _intent();
        i.targetAsset = address(eurm);
        bytes memory err =
            abi.encodeWithSelector(CorridorRouter.CorridorNotRegistered.selector, address(ausd), address(eurm));
        _expectRevertVia(false, i, err);
        _expectRevertVia(true, i, err);
    }

    /// Neither the router nor the venue adapter has a sweep — deliberately — so target
    /// tokens delivered to either would be stuck forever. Both are refused before the
    /// swap, on both paths, and nothing moves.
    function test_settle_recipientRouterOrVenueReverts() public {
        address[2] memory bad = [address(router), address(venue)];
        for (uint256 k = 0; k < bad.length; ++k) {
            PayoutIntent.Intent memory i = _intent();
            i.recipient = bad[k];
            bytes memory err = abi.encodeWithSelector(CorridorRouter.InvalidRecipient.selector, bad[k]);
            uint256 payerBefore = ausd.balanceOf(payer);

            _expectRevertVia(false, i, err);
            _expectRevertVia(true, i, err);

            assertEq(ausd.balanceOf(payer), payerBefore, "payer untouched");
            assertEq(gbpm.balanceOf(bad[k]), 0, "nothing delivered");
            assertEq(venue.swapCount(), 0, "venue never called");
            assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
            assertFalse(ausd.authorizationState(payer, router.hashIntent(i)), "path-A nonce rolled back");
        }
    }

    function test_settle_noApprovalReverts() public {
        vm.prank(payer);
        ausd.approve(address(router), 0);
        PayoutIntent.Intent memory i = _intent();
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(router), 0, SOURCE)
        );
        router.settle(i);
    }

    // =========================================================================
    // path A signature binding
    // =========================================================================

    function test_settleWithAuthorization_anyoneMaySubmit() public {
        PayoutIntent.Intent memory i = _intent();
        bytes memory sig = _sig(i);
        address someone = makeAddr("someone");
        vm.prank(someone);
        router.settleWithAuthorization(i, sig);
        assertEq(gbpm.balanceOf(recipient), QUOTE);
    }

    /// Signature made for one intent, submitted with another: nonce != hashIntent(tampered),
    /// so ECDSA recovers a stranger and the token rejects it.
    function test_settleWithAuthorization_tamperedIntentRevertsAtToken() public {
        PayoutIntent.Intent memory i = _intent();
        bytes memory sig = _sig(i);

        PayoutIntent.Intent memory t = _intent();
        t.recipient = makeAddr("thief");
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        router.settleWithAuthorization(t, sig);

        t = _intent();
        t.quotedAmountOut = 1; // would drop minOut to almost nothing
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        router.settleWithAuthorization(t, sig);

        t = _intent();
        t.sourceAmount = SOURCE * 2;
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        router.settleWithAuthorization(t, sig);

        assertEq(attestation.count(), 0);
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
    }

    function test_settleWithAuthorization_wrongSignerRevertsAtToken() public {
        PayoutIntent.Intent memory i = _intent();
        bytes memory sig = _signAuth(strangerKey, i, router.hashIntent(i));
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        router.settleWithAuthorization(i, sig);
    }

    /// Payer cancels at the token (gasless-friendly) -> router's early check reverts AuthorizationUsed.
    function test_settleWithAuthorization_cancelledAuthorizationRevertsAuthorizationUsed() public {
        PayoutIntent.Intent memory i = _intent();
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _sig(i);

        ausd.cancelAuthorization(payer, id, _signCancel(payerKey, payer, id));
        assertTrue(ausd.authorizationState(payer, id));

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(CorridorRouter.AuthorizationUsed.selector, id));
        router.settleWithAuthorization(i, sig);
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.None), "router-side lifecycle untouched");
    }

    // =========================================================================
    // guards inside _settle, both entry points
    // =========================================================================

    function _insufficientDelivery(bool pathA) internal {
        PayoutIntent.Intent memory i = _intent();
        uint256 minOut = router.minAmountOut(i);
        assertEq(minOut, 73.490103e18);
        venue.setDelivered(minOut - 1);
        uint256 payerBefore = ausd.balanceOf(payer);
        _expectRevertVia(
            pathA, i, abi.encodeWithSelector(CorridorRouter.InsufficientDelivery.selector, minOut - 1, minOut)
        );
        assertEq(gbpm.balanceOf(recipient), 0, "swap rolled back");
        assertEq(ausd.balanceOf(payer), payerBefore, "pull rolled back");
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));

        // exactly minOut is fine (it is 68 bps off the reference, so lift the disclosure limit)
        venue.setDelivered(minOut);
        i.maxSpreadBps = 100;
        assertEq(_settleVia(pathA, i), minOut);
        assertEq(attestation.get(router.hashIntent(i)).spreadBps, 68);
    }

    function test_settle_deliveredBelowMinOutReverts() public {
        _insufficientDelivery(false);
    }

    function test_settleWithAuthorization_deliveredBelowMinOutReverts() public {
        _insufficientDelivery(true);
    }

    function _spreadTooWide(bool pathA) internal {
        // delivered 73.556 -> executed 0.73556 -> (0.74-0.73556)/0.74 = 60 bps > 50; still above minOut
        uint256 delivered = 73.556e18;
        PayoutIntent.Intent memory i = _intent();
        assertGt(delivered, router.minAmountOut(i));
        assertEq(Corridor.spreadBps(REF, Corridor.executedRate(SOURCE, 6, delivered, 18)), 60);
        venue.setDelivered(delivered);

        uint256 payerBefore = ausd.balanceOf(payer);
        _expectRevertVia(
            pathA, i, abi.encodeWithSelector(CorridorRouter.SpreadTooWide.selector, int256(60), MAX_SPREAD)
        );

        assertEq(gbpm.balanceOf(recipient), 0, "swap rolled back: recipient unchanged");
        assertEq(ausd.balanceOf(payer), payerBefore, "pull rolled back: payer unchanged");
        assertEq(ausd.balanceOf(address(venue)), 0, "venue funding rolled back");
        assertEq(attestation.count(), 0);
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
    }

    function test_settle_spreadTooWideReverts() public {
        _spreadTooWide(false);
    }

    function test_settleWithAuthorization_spreadTooWideReverts() public {
        _spreadTooWide(true);
    }

    function _staleRateSource(bool pathA) internal {
        rateSource.setRevertStale(true);
        PayoutIntent.Intent memory i = _intent();
        uint256 payerBefore = ausd.balanceOf(payer);
        _expectRevertVia(
            pathA,
            i,
            abi.encodeWithSelector(
                IRateSource.StaleReferenceRate.selector,
                address(rateSource),
                rateSource.updatedAt(),
                rateSource.MAX_AGE()
            )
        );
        assertEq(ausd.balanceOf(payer), payerBefore, "payer balance unchanged");
        assertEq(ausd.balanceOf(address(venue)), 0, "venue never funded");
        assertEq(venue.swapCount(), 0, "swap never attempted: reference is read before the swap");
        assertEq(gbpm.balanceOf(recipient), 0);
    }

    function test_settle_staleRateSourceRevertsBeforeSwap() public {
        _staleRateSource(false);
    }

    function test_settleWithAuthorization_staleRateSourceRevertsBeforeSwap() public {
        _staleRateSource(true);
    }

    function _venueRevertBubbles(bool pathA) internal {
        venue.setRevertOnSwap(true);
        PayoutIntent.Intent memory i = _intent();
        _expectRevertVia(pathA, i, abi.encodeWithSelector(MockVenue.SwapReverted.selector));
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
    }

    function test_settle_venueRevertBubbles() public {
        _venueRevertBubbles(false);
    }

    function test_settleWithAuthorization_venueRevertBubbles() public {
        _venueRevertBubbles(true);
    }

    /// Narrowing into the packed receipt is guarded: a sourceAmount above uint128 reverts
    /// ValueOverflow rather than storing a truncated receipt.
    function test_settle_valueOverflowOnReceiptCast() public {
        uint256 huge = uint256(type(uint128).max) + 1;
        ausd.mint(payer, huge);
        // keep the executed rate ~0.7386 so InsufficientDelivery / SpreadTooWide do not fire first
        uint256 delivered = huge * EXECUTED_19BPS / 1e6;
        venue.setDelivered(delivered);
        PayoutIntent.Intent memory i = _intent();
        i.sourceAmount = huge;
        i.quotedAmountOut = delivered;
        _expectRevertVia(false, i, abi.encodeWithSelector(CorridorRouter.ValueOverflow.selector));
    }

    // =========================================================================
    // reentrancy
    // =========================================================================

    function _registerReentrant() internal returns (ReentrantVenue rv, PayoutIntent.Intent memory i) {
        rv = new ReentrantVenue();
        rv.setQuote(QUOTE);
        rv.setDelivered(QUOTE);
        rateSource.setSupported(address(ausd), address(eurm), true);
        vm.prank(owner);
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, rv);
        i = _intent();
        i.targetAsset = address(eurm);
    }

    function test_settle_reentrancyViaSettleReverts() public {
        (ReentrantVenue rv, PayoutIntent.Intent memory i) = _registerReentrant();
        rv.setReentry(address(router), abi.encodeCall(router.settle, (i)));

        vm.prank(payer);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        router.settle(i);

        assertEq(attestation.count(), 0);
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
        assertEq(eurm.balanceOf(recipient), 0);
    }

    function test_settle_reentrancyViaSettleWithAuthorizationReverts() public {
        (ReentrantVenue rv, PayoutIntent.Intent memory i) = _registerReentrant();
        // a second, distinct intent with a valid authorization, injected mid-swap
        PayoutIntent.Intent memory j = i;
        j.salt = bytes32(uint256(2));
        rv.setReentry(address(router), abi.encodeCall(router.settleWithAuthorization, (j, _sig(j))));

        vm.prank(payer);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        router.settle(i);
        assertEq(attestation.count(), 0);
    }

    function test_settleWithAuthorization_reentrancyReverts() public {
        (ReentrantVenue rv, PayoutIntent.Intent memory i) = _registerReentrant();
        PayoutIntent.Intent memory j = i;
        j.salt = bytes32(uint256(2));
        rv.setReentry(address(router), abi.encodeCall(router.settle, (j)));

        bytes memory sig = _sig(i);
        vm.prank(relayer);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        router.settleWithAuthorization(i, sig);
        assertEq(attestation.count(), 0);
        assertFalse(ausd.authorizationState(payer, router.hashIntent(i)));
    }

    // =========================================================================
    // previewQuote (never reverts)
    // =========================================================================

    function test_previewQuote_open() public view {
        (uint256 q, uint256 r, IVenueAdapter.Status s) = router.previewQuote(address(ausd), address(gbpm), SOURCE);
        assertEq(q, QUOTE);
        assertEq(r, REF);
        assertEq(uint8(s), uint8(IVenueAdapter.Status.Open));
    }

    function test_previewQuote_unregisteredIsNoRoute() public view {
        (uint256 q, uint256 r, IVenueAdapter.Status s) = router.previewQuote(address(ausd), address(eurm), SOURCE);
        assertEq(q, 0);
        assertEq(r, 0);
        assertEq(uint8(s), uint8(IVenueAdapter.Status.NoRoute));
    }

    function test_previewQuote_venueQuoteRevertDoesNotBubble() public {
        venue.setRevertOnQuote(true);
        venue.setStatus(IVenueAdapter.Status.MarketClosed);
        (uint256 q, uint256 r, IVenueAdapter.Status s) = router.previewQuote(address(ausd), address(gbpm), SOURCE);
        assertEq(q, 0, "quote unavailable");
        assertEq(r, REF, "reference still readable");
        assertEq(uint8(s), uint8(IVenueAdapter.Status.MarketClosed));
    }

    function test_previewQuote_venueStatusRevertIsNoRoute() public {
        venue.setRevertOnStatus(true);
        (uint256 q,, IVenueAdapter.Status s) = router.previewQuote(address(ausd), address(gbpm), SOURCE);
        assertEq(q, QUOTE);
        assertEq(uint8(s), uint8(IVenueAdapter.Status.NoRoute));
    }

    function test_previewQuote_staleReferenceIsOracleStale() public {
        rateSource.setRevertStale(true);
        (uint256 q, uint256 r, IVenueAdapter.Status s) = router.previewQuote(address(ausd), address(gbpm), SOURCE);
        assertEq(q, QUOTE, "venue quote still readable");
        assertEq(r, 0, "reference unavailable");
        assertEq(uint8(s), uint8(IVenueAdapter.Status.OracleStale), "settlement would revert at step 3");

        // a venue-side reason takes precedence over the reference read
        venue.setStatus(IVenueAdapter.Status.TradingSuspended);
        (,, s) = router.previewQuote(address(ausd), address(gbpm), SOURCE);
        assertEq(uint8(s), uint8(IVenueAdapter.Status.TradingSuspended));
    }

    // =========================================================================
    // ownership
    // =========================================================================

    function test_ownable2Step_transfer() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        router.transferOwnership(newOwner);
        assertEq(router.owner(), owner, "unchanged until accepted");
        assertEq(router.pendingOwner(), newOwner);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        router.acceptOwnership();

        vm.prank(newOwner);
        router.acceptOwnership();
        assertEq(router.owner(), newOwner);
        assertEq(router.pendingOwner(), address(0));

        rateSource.setSupported(address(ausd), address(eurm), true);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, venue);

        vm.prank(newOwner);
        router.registerCorridor(address(ausd), address(eurm), keccak256("USD/EUR"), rateSource, venue);
    }

    /// The owner can only add corridors. By ABI: CorridorRouter's non-view, non-pure
    /// functions are exactly
    ///   registerCorridor        onlyOwner, write-once per pair (no update/remove exists)
    ///   settle                  gated on msg.sender == intent.payer
    ///   settleWithAuthorization open to anyone, spends the payer's own signature
    ///   cancel                  gated on msg.sender == intent.payer (PayoutIntent)
    ///   transferOwnership / acceptOwnership / renounceOwnership  (Ownable2Step) change only who the owner is
    /// There is no pause, upgrade, sweep, fee, setter, receive or fallback, and the
    /// receipt store's only writer is this router (RateAttestation.router), which has
    /// no function forwarding an arbitrary attest. The runtime checks below cover the
    /// parts of that claim that can be exercised.
    function test_owner_canOnlyRegister() public {
        // no receive/fallback: native value and unknown selectors bounce
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        (bool ok,) = address(router).call{value: 1}("");
        assertFalse(ok, "no receive");
        vm.prank(owner);
        (ok,) = address(router).call(abi.encodeWithSignature("pause()"));
        assertFalse(ok, "no fallback");

        // the owner cannot write receipts directly
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRateAttestation.NotRouter.selector, owner));
        attestation.attest(
            bytes32(uint256(1)), _expectedReceipt(QUOTE, 19), payer, recipient, address(ausd), address(gbpm)
        );

        // the owner cannot settle or cancel someone else's intent
        PayoutIntent.Intent memory i = _intent();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.NotPayer.selector, owner, payer));
        router.settle(i);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutIntent.NotPayer.selector, owner, payer));
        router.cancel(i);

        // and cannot re-point an existing corridor (write-once)
        MockVenue evil = new MockVenue();
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(CorridorRouter.CorridorAlreadyRegistered.selector, address(ausd), address(gbpm))
        );
        router.registerCorridor(address(ausd), address(gbpm), CORRIDOR, rateSource, evil);
    }

    // =========================================================================
    // fuzz: either settles with delivered >= minOut and a consistent receipt, or InsufficientDelivery
    // =========================================================================

    function _fuzzCase(bool pathA, uint256 sourceAmount, uint256 quote, uint16 tolerance, uint256 delivered) internal {
        sourceAmount = bound(sourceAmount, 1, 1e12); // up to 1M AUSD
        quote = bound(quote, 1, 1e26);
        tolerance = uint16(bound(tolerance, 0, 9_999));
        delivered = bound(delivered, 0, sourceAmount * 1e14); // executed rate <= 1e20, spread fits int32

        ausd.mint(payer, sourceAmount);
        venue.setQuote(quote);
        venue.setDelivered(delivered);

        PayoutIntent.Intent memory i = _intent();
        i.sourceAmount = sourceAmount;
        i.quotedAmountOut = quote;
        i.toleranceBps = tolerance;
        i.maxSpreadBps = type(uint16).max; // spread <= 10_000 always, so never SpreadTooWide
        bytes32 id = router.hashIntent(i);
        uint256 minOut = router.minAmountOut(i);

        if (delivered < minOut) {
            _expectRevertVia(
                pathA, i, abi.encodeWithSelector(CorridorRouter.InsufficientDelivery.selector, delivered, minOut)
            );
            assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.None));
            assertEq(gbpm.balanceOf(recipient), 0);
            return;
        }

        uint256 out = _settleVia(pathA, i);
        assertEq(out, delivered);
        assertGe(out, minOut);
        assertEq(gbpm.balanceOf(recipient), delivered);

        IRateAttestation.Attestation memory r = attestation.get(id);
        uint256 executed = Corridor.executedRate(sourceAmount, 6, delivered, 18);
        assertEq(r.executedRate, executed, "receipt.executedRate == Corridor.executedRate");
        assertEq(r.spreadBps, int32(Corridor.spreadBps(REF, executed)));
        assertEq(r.sourceAmount, sourceAmount);
        assertEq(r.deliveredAmount, delivered);
        assertEq(r.referenceRate, REF);
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.Filled));
    }

    function testFuzz_settle_deliveredVsMinOut(uint256 sourceAmount, uint256 quote, uint16 tolerance, uint256 delivered)
        public
    {
        _fuzzCase(false, sourceAmount, quote, tolerance, delivered);
    }

    function testFuzz_settleWithAuthorization_deliveredVsMinOut(
        uint256 sourceAmount,
        uint256 quote,
        uint16 tolerance,
        uint256 delivered
    ) public {
        _fuzzCase(true, sourceAmount, quote, tolerance, delivered);
    }

    // =========================================================================
    // gas (mocks; Monad MonadTen pricing via foundry.toml)
    // =========================================================================

    function test_gas_settle_pathB() public {
        PayoutIntent.Intent memory i = _intent();
        vm.prank(payer);
        uint256 g = gasleft();
        router.settle(i);
        g -= gasleft();
        emit log_named_uint("gas: settle() path B with mocks", g);
    }

    function test_gas_settle_pathA() public {
        PayoutIntent.Intent memory i = _intent();
        bytes memory sig = _sig(i);
        vm.prank(relayer);
        uint256 g = gasleft();
        router.settleWithAuthorization(i, sig);
        g -= gasleft();
        emit log_named_uint("gas: settleWithAuthorization() path A with mocks", g);
    }
}
