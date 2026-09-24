// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {HandleRegistry} from "../src/HandleRegistry.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";
import {BareDelegate} from "./mocks/BareDelegate.sol";

/// Tries to turn someone else's old signature into their handle in one transaction: replay
/// the signature so the victim lets go of the handle they hold now, then register it.
contract HandleThief {
    HandleRegistry internal immutable reg;

    constructor(HandleRegistry reg_) {
        reg = reg_;
    }

    function take(string calldata handle) external {
        reg.register(handle);
    }

    /// Lets go of whatever it holds (the name it front-ran, say), replays `sig` as the
    /// victim's registration of `signed`, and takes `grab`, which that switch frees.
    function viaRegister(
        address victim,
        string calldata signed,
        uint256 deadline,
        bytes calldata sig,
        string calldata grab
    ) external {
        if (bytes(reg.handleOf(address(this))).length != 0) reg.release();
        reg.registerFor(victim, signed, deadline, sig);
        reg.register(grab);
    }

    function viaRelease(address victim, uint256 deadline, bytes calldata sig, string calldata grab) external {
        reg.releaseFor(victim, deadline, sig);
        reg.register(grab);
    }
}

contract HandleRegistryTest is Test {
    HandleRegistry internal reg;

    address internal alice;
    uint256 internal alicePk;
    address internal bob;
    uint256 internal bobPk;
    address internal relayer = makeAddr("relayer");

    bytes32 internal constant REGISTER_TYPEHASH =
        keccak256("Register(address owner,string handle,uint256 nonce,uint256 deadline)");
    bytes32 internal constant RELEASE_TYPEHASH = keccak256("Release(address owner,uint256 nonce,uint256 deadline)");
    bytes32 internal constant CANCEL_TYPEHASH = keccak256("Cancel(address owner,uint256 nonce,uint256 deadline)");

    function setUp() public {
        reg = new HandleRegistry();
        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");
        vm.warp(1_789_000_000);
    }

    // ---------------------------------------------------------------------
    // EIP-712 helpers, computed by hand so a client implementation has a vector
    // ---------------------------------------------------------------------

    function _domainSeparator(address registry) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Henad Handles"),
                keccak256("1"),
                block.chainid,
                registry
            )
        );
    }

    function _registerDigest(address registry, address owner, string memory handle, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(REGISTER_TYPEHASH, owner, keccak256(bytes(handle)), nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(registry), structHash));
    }

    function _releaseDigest(address registry, address owner, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(RELEASE_TYPEHASH, owner, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(registry), structHash));
    }

    function _cancelDigest(address registry, address owner, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(CANCEL_TYPEHASH, owner, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(registry), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Signs against the owner's current nonce on `reg`.
    function _signRegister(uint256 pk, address owner, string memory handle, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, _registerDigest(address(reg), owner, handle, reg.nonces(owner), deadline));
    }

    function _signRelease(uint256 pk, address owner, uint256 deadline) internal view returns (bytes memory) {
        return _sign(pk, _releaseDigest(address(reg), owner, reg.nonces(owner), deadline));
    }

    function _signCancel(uint256 pk, address owner, uint256 deadline) internal view returns (bytes memory) {
        return _sign(pk, _cancelDigest(address(reg), owner, reg.nonces(owner), deadline));
    }

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 600;
    }

    // ---------------------------------------------------------------------
    // Domain and typehashes
    // ---------------------------------------------------------------------

    function test_typehashes_matchSpec() public view {
        assertEq(reg.REGISTER_TYPEHASH(), REGISTER_TYPEHASH);
        assertEq(reg.RELEASE_TYPEHASH(), RELEASE_TYPEHASH);
        assertEq(reg.CANCEL_TYPEHASH(), CANCEL_TYPEHASH);
    }

    function test_domain_isHenadHandlesV1BoundToThisChainAndContract() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) = reg.eip712Domain();
        assertEq(name, "Henad Handles");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(reg));
    }

    // ---------------------------------------------------------------------
    // Shape: ^[a-z0-9_]{3,20}$
    // ---------------------------------------------------------------------

    function test_isValidHandle_accepts() public view {
        assertTrue(reg.isValidHandle("ada"));
        assertTrue(reg.isValidHandle("abcdefghijklm"));
        assertTrue(reg.isValidHandle("nopqrstuvwxyz"));
        assertTrue(reg.isValidHandle("0123456789"));
        assertTrue(reg.isValidHandle("___"));
        assertTrue(reg.isValidHandle("_ada_2026"));
    }

    function test_isValidHandle_lengthBoundaries() public view {
        assertFalse(reg.isValidHandle(""), "0");
        assertFalse(reg.isValidHandle("ab"), "2");
        assertTrue(reg.isValidHandle("abc"), "3");
        assertTrue(reg.isValidHandle("abcdefghijklmnopqrst"), "20");
        assertFalse(reg.isValidHandle("abcdefghijklmnopqrstu"), "21");
    }

    /// Every one of the 256 byte values in every position class, exhaustively: the
    /// allowed set is exactly a-z, 0-9 and '_'.
    function test_isValidHandle_everyByteValue() public view {
        for (uint256 i; i < 256; ++i) {
            bytes1 c = bytes1(uint8(i));
            bool allowed = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_";
            assertEq(reg.isValidHandle(string(abi.encodePacked(c, "da"))), allowed, "first");
            assertEq(reg.isValidHandle(string(abi.encodePacked("a", c, "a"))), allowed, "middle");
            assertEq(reg.isValidHandle(string(abi.encodePacked("ad", c))), allowed, "last");
        }
    }

    function test_isValidHandle_everyLength() public view {
        bytes memory s;
        for (uint256 len; len <= 40; ++len) {
            assertEq(reg.isValidHandle(string(s)), len >= 3 && len <= 20);
            s = abi.encodePacked(s, "a");
        }
    }

    function test_register_acceptsBoundaryLengths() public {
        vm.prank(alice);
        reg.register("abc");
        assertEq(reg.ownerOf("abc"), alice);

        vm.prank(bob);
        reg.register("abcdefghijklmnopqrst");
        assertEq(reg.ownerOf("abcdefghijklmnopqrst"), bob);
    }

    function test_register_rejectsBadShapes() public {
        string[18] memory bad = [
            "", // empty
            "ab", // 2
            "abcdefghijklmnopqrstu", // 21
            "Ada", // uppercase
            "ADA",
            "adA",
            "ada.eth", // '.'
            "ada-lovelace", // '-'
            "ada lovelace", // space
            " ada",
            "@ada", // the '@' is display only
            "ada!",
            "ada\x00", // NUL
            unicode"adé", // multi-byte UTF-8
            unicode"аda", // Cyrillic "а", a lookalike of Latin "a"
            unicode"ada😀",
            unicode"ａｄａ", // full-width
            "ada/x"
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidHandle.selector, bad[i]));
            vm.prank(alice);
            reg.register(bad[i]);
        }
        assertEq(reg.handleOf(alice), "");
    }

    // ---------------------------------------------------------------------
    // register / ownerOf / handleOf
    // ---------------------------------------------------------------------

    function test_register_storesBothDirectionsAndEmits() public {
        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleRegistered(alice, "ada");
        vm.prank(alice);
        reg.register("ada");

        assertEq(reg.ownerOf("ada"), alice);
        assertEq(reg.handleOf(alice), "ada");
    }

    function test_views_unknownIsZeroAndEmpty() public view {
        assertEq(reg.ownerOf("nobody"), address(0));
        assertEq(reg.handleOf(alice), "");
        assertEq(reg.nonces(alice), 0);
    }

    function test_ownerOf_isExactMatch() public {
        vm.prank(alice);
        reg.register("ada");
        assertEq(reg.ownerOf("Ada"), address(0));
        assertEq(reg.ownerOf("ADA"), address(0));
        assertEq(reg.ownerOf("@ada"), address(0));
        assertEq(reg.ownerOf("ada "), address(0));
    }

    function test_register_rejectsHandleHeldBySomeoneElse() public {
        vm.prank(alice);
        reg.register("ada");

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.HandleTaken.selector, "ada"));
        vm.prank(bob);
        reg.register("ada");

        assertEq(reg.ownerOf("ada"), alice);
        assertEq(reg.handleOf(bob), "");
    }

    function test_register_rejectsCallersOwnHandle() public {
        vm.prank(alice);
        reg.register("ada");

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.HandleTaken.selector, "ada"));
        vm.prank(alice);
        reg.register("ada");
    }

    function test_register_changeReleasesPrevious() public {
        vm.prank(alice);
        reg.register("ada");

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleReleased(alice, "ada");
        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleRegistered(alice, "lovelace");
        vm.prank(alice);
        reg.register("lovelace");

        assertEq(reg.ownerOf("ada"), address(0), "old handle freed");
        assertEq(reg.ownerOf("lovelace"), alice);
        assertEq(reg.handleOf(alice), "lovelace");

        // the freed name is anyone's now
        vm.prank(bob);
        reg.register("ada");
        assertEq(reg.ownerOf("ada"), bob);
        assertEq(reg.handleOf(alice), "lovelace", "alice unaffected");
    }

    /// Every action that lands spends the nonce, so the nonce names one state of the
    /// owner's handle. One that reverts changes nothing and spends nothing.
    function test_directForms_spendTheNonce() public {
        vm.prank(alice);
        reg.register("ada");
        assertEq(reg.nonces(alice), 1, "register");

        vm.prank(bob);
        reg.register("bob");
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.HandleTaken.selector, "bob"));
        vm.prank(alice);
        reg.register("bob");
        assertEq(reg.nonces(alice), 1, "a failed register spends nothing");

        vm.prank(alice);
        reg.release();
        assertEq(reg.nonces(alice), 2, "release");

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.NoHandle.selector, alice));
        vm.prank(alice);
        reg.release();
        assertEq(reg.nonces(alice), 2, "a failed release spends nothing");
    }

    /// The stale-signature theft. Alice signs a change for the relayer, it stalls, and she
    /// then registers "lovelace" herself. Had her direct call left the nonce alone, either
    /// old signature would still verify, free "lovelace" and let the thief take it in the
    /// same transaction, though alice never agreed to give up a handle she took later.
    function test_directRegister_killsSignaturesMadeBefore() public {
        vm.prank(alice);
        reg.register("alice_old");
        uint256 deadline = _deadline();
        bytes memory staleRegister = _signRegister(alicePk, alice, "ada", deadline);
        bytes memory staleRelease = _signRelease(alicePk, alice, deadline);

        vm.prank(alice);
        reg.register("lovelace");

        HandleThief thief = new HandleThief(reg);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        thief.viaRegister(alice, "ada", deadline, staleRegister, "lovelace");
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        thief.viaRelease(alice, deadline, staleRelease, "lovelace");

        assertEq(reg.ownerOf("lovelace"), alice);
        assertEq(reg.handleOf(alice), "lovelace");
        assertEq(reg.ownerOf("ada"), address(0));
    }

    /// The same through a direct release: the old Register would otherwise hand alice a
    /// name she has since decided against.
    function test_directRelease_killsSignaturesMadeBefore() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory staleRegister = _signRegister(alicePk, alice, "lovelace", deadline);

        vm.prank(alice);
        reg.release();

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "lovelace", deadline, staleRegister);
        assertEq(reg.handleOf(alice), "");
    }

    // ---------------------------------------------------------------------
    // release
    // ---------------------------------------------------------------------

    function test_release_clearsBothDirectionsAndEmits() public {
        vm.prank(alice);
        reg.register("ada");

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleReleased(alice, "ada");
        vm.prank(alice);
        reg.release();

        assertEq(reg.ownerOf("ada"), address(0));
        assertEq(reg.handleOf(alice), "");

        vm.prank(bob);
        reg.register("ada");
        assertEq(reg.ownerOf("ada"), bob);
    }

    function test_release_withoutHandleReverts() public {
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.NoHandle.selector, alice));
        vm.prank(alice);
        reg.release();
    }

    function test_release_thenRegisterAgain() public {
        vm.startPrank(alice);
        reg.register("ada");
        reg.release();
        reg.register("ada");
        vm.stopPrank();
        assertEq(reg.ownerOf("ada"), alice);
        assertEq(reg.handleOf(alice), "ada");
    }

    // ---------------------------------------------------------------------
    // registerFor
    // ---------------------------------------------------------------------

    function test_registerFor_validEoaSignature() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleRegistered(alice, "ada");
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);

        assertEq(reg.ownerOf("ada"), alice, "handle points at the signer, not the relayer");
        assertEq(reg.handleOf(alice), "ada");
        assertEq(reg.handleOf(relayer), "");
        assertEq(reg.nonces(alice), 1);
    }

    function test_registerFor_changeReleasesPrevious() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "lovelace", deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleReleased(alice, "ada");
        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleRegistered(alice, "lovelace");
        vm.prank(relayer);
        reg.registerFor(alice, "lovelace", deadline, sig);

        assertEq(reg.ownerOf("ada"), address(0));
        assertEq(reg.ownerOf("lovelace"), alice);
    }

    function test_registerFor_wrongSignerRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(bobPk, alice, "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);
        assertEq(reg.nonces(alice), 0, "a failed call spends nothing");
    }

    function test_registerFor_tamperedHandleRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "adb", deadline, sig);
    }

    function test_registerFor_tamperedDeadlineRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "ada", deadline + 1, sig);
    }

    /// The signature names its owner: submitting it for someone else fails rather than
    /// giving them the handle.
    function test_registerFor_signatureCannotBeRedirectedToAnotherOwner() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, bob));
        reg.registerFor(bob, "ada", deadline, sig);
    }

    function test_registerFor_expiredRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.SignatureExpired.selector, deadline));
        reg.registerFor(alice, "ada", deadline, sig);
    }

    function test_registerFor_acceptedAtDeadline() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.warp(deadline);
        reg.registerFor(alice, "ada", deadline, sig);
        assertEq(reg.ownerOf("ada"), alice);
    }

    /// The replay that matters: the handle is free again and alice holds nothing, so only
    /// the spent nonce stands between the old signature and a second registration.
    function test_registerFor_replayRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);

        vm.prank(alice);
        reg.release();
        assertEq(reg.ownerOf("ada"), address(0));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);
    }

    function test_registerFor_futureNonceRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _sign(alicePk, _registerDigest(address(reg), alice, "ada", 1, deadline));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "ada", deadline, sig);
    }

    function test_registerFor_otherDeploymentsSignatureRejected() public {
        HandleRegistry other = new HandleRegistry();
        uint256 deadline = _deadline();
        bytes memory sig = _sign(alicePk, _registerDigest(address(other), alice, "ada", 0, deadline));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "ada", deadline, sig);

        other.registerFor(alice, "ada", deadline, sig); // and it is valid where it was meant
        assertEq(other.ownerOf("ada"), alice);
    }

    function test_registerFor_releaseSignatureNotAcceptedAsRegister() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "ada", deadline, sig);
    }

    function test_registerFor_zeroOwnerRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, address(0), "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, address(0)));
        reg.registerFor(address(0), "ada", deadline, sig);

        bytes memory garbage = new bytes(65);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, address(0)));
        reg.registerFor(address(0), "ada", deadline, garbage);
    }

    function test_registerFor_badShapeRejectedEvenWithValidSignature() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "Ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidHandle.selector, "Ada"));
        reg.registerFor(alice, "Ada", deadline, sig);
        assertEq(reg.nonces(alice), 0);
    }

    /// The accepted front-run: bob takes the name from the mempool first. Alice's
    /// transaction still lands, reports the name unavailable and spends her signature;
    /// her existing handle stays hers, and her signature gets bob nothing of his own.
    function test_registerFor_frontRunSpendsTheSignature() public {
        vm.prank(alice);
        reg.register("alice_old");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.prank(bob);
        reg.register("ada");

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleUnavailable(alice, "ada");
        vm.prank(relayer);
        bool registered = reg.registerFor(alice, "ada", deadline, sig);

        assertFalse(registered, "reported as taken");
        assertEq(reg.handleOf(alice), "alice_old");
        assertEq(reg.ownerOf("alice_old"), alice);
        assertEq(reg.ownerOf("ada"), bob);
        assertEq(reg.nonces(alice), 2, "the failed attempt spent the signature");

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, bob));
        vm.prank(bob);
        reg.registerFor(bob, "ada2", deadline, sig);

        // and once bob lets go, the signature is still dead
        vm.prank(bob);
        reg.release();
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);
        assertEq(reg.ownerOf("alice_old"), alice);
    }

    /// The front-run as a theft, in one transaction from a contract. Had the failed call
    /// reverted, alice's nonce would be unspent, the thief would let "ada" go, replay her
    /// signature (switching her to "ada", after her app had told her the change failed)
    /// and register "alice_old", the handle she was still giving to people who pay her.
    function test_registerFor_frontRunnerCannotReplayForTheOldHandle() public {
        vm.prank(alice);
        reg.register("alice_old");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        HandleThief thief = new HandleThief(reg);
        thief.take("ada");
        vm.prank(relayer);
        assertFalse(reg.registerFor(alice, "ada", deadline, sig));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        thief.viaRegister(alice, "ada", deadline, sig, "alice_old");

        assertEq(reg.ownerOf("alice_old"), alice);
        assertEq(reg.handleOf(alice), "alice_old");
        assertEq(reg.ownerOf("ada"), address(thief));
    }

    /// Control for the two theft tests: the thief's calls do go through while a signature
    /// is live, because then they are exactly what alice signed; the switch frees her old
    /// handle and a free handle is anyone's. The thefts fail only because the nonce is spent.
    function test_thief_succeedsOnlyWithALiveSignature() public {
        vm.prank(alice);
        reg.register("alice_old");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        HandleThief thief = new HandleThief(reg);
        thief.viaRegister(alice, "ada", deadline, sig, "alice_old");
        assertEq(reg.ownerOf("ada"), alice);
        assertEq(reg.ownerOf("alice_old"), address(thief));
    }

    /// Signing for the handle you already hold is refused the same way, and spends the
    /// signature the same way.
    function test_registerFor_ownHandleIsUnavailableToo() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleUnavailable(alice, "ada");
        assertFalse(reg.registerFor(alice, "ada", deadline, sig));
        assertEq(reg.ownerOf("ada"), alice);
        assertEq(reg.nonces(alice), 2);
    }

    // ---------------------------------------------------------------------
    // Contract wallets and 7702-delegated EOAs
    // ---------------------------------------------------------------------

    function test_registerFor_erc1271Wallet() public {
        (address walletKey, uint256 walletKeyPk) = makeAddrAndKey("walletKey");
        MockERC1271Wallet wallet = new MockERC1271Wallet(walletKey);
        uint256 deadline = _deadline();
        bytes memory sig = _sign(walletKeyPk, _registerDigest(address(reg), address(wallet), "safe_ada", 0, deadline));

        vm.prank(relayer);
        reg.registerFor(address(wallet), "safe_ada", deadline, sig);

        assertEq(reg.ownerOf("safe_ada"), address(wallet));
        assertEq(reg.handleOf(walletKey), "", "the handle is the wallet's, not its key's");
        assertEq(reg.nonces(address(wallet)), 1);
    }

    function test_registerFor_erc1271WalletRejectsStranger() public {
        (address walletKey,) = makeAddrAndKey("walletKey");
        MockERC1271Wallet wallet = new MockERC1271Wallet(walletKey);
        uint256 deadline = _deadline();
        bytes memory sig = _sign(bobPk, _registerDigest(address(reg), address(wallet), "safe_ada", 0, deadline));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, address(wallet)));
        reg.registerFor(address(wallet), "safe_ada", deadline, sig);
    }

    function test_releaseFor_erc1271Wallet() public {
        (address walletKey, uint256 walletKeyPk) = makeAddrAndKey("walletKey");
        MockERC1271Wallet wallet = new MockERC1271Wallet(walletKey);
        vm.prank(address(wallet));
        reg.register("safe_ada");

        uint256 deadline = _deadline();
        // nonce 1: the wallet's own register spent 0
        bytes memory sig = _sign(walletKeyPk, _releaseDigest(address(reg), address(wallet), 1, deadline));
        reg.releaseFor(address(wallet), deadline, sig);
        assertEq(reg.ownerOf("safe_ada"), address(0));
    }

    /// Henad users are 7702-delegated EOAs. With a delegate that has no ERC-1271 at all,
    /// the owner's own key must still work; this is why ECDSA is tried first.
    function test_registerFor_7702DelegatedEoaWithoutErc1271() public {
        BareDelegate delegate = new BareDelegate();
        vm.signAndAttachDelegation(address(delegate), alicePk);
        (bool ok,) = alice.call("");
        assertTrue(ok, "delegation tx failed");
        assertEq(alice.code.length, 23, "alice is delegated");

        uint256 deadline = _deadline();
        bytes32 digest = _registerDigest(address(reg), alice, "ada", 0, deadline);
        bytes memory sig = _sign(alicePk, digest);
        assertFalse(SignatureChecker.isValidSignatureNow(alice, digest, sig), "SignatureChecker alone rejects it");

        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, sig);
        assertEq(reg.ownerOf("ada"), alice);

        bytes memory forged = _signRegister(bobPk, alice, "ada2", deadline);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "ada2", deadline, forged);
    }

    // ---------------------------------------------------------------------
    // releaseFor
    // ---------------------------------------------------------------------

    function test_releaseFor_validSignature() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.HandleReleased(alice, "ada");
        vm.prank(relayer);
        reg.releaseFor(alice, deadline, sig);

        assertEq(reg.ownerOf("ada"), address(0));
        assertEq(reg.handleOf(alice), "");
        assertEq(reg.nonces(alice), 2, "one for the register, one for the release");
    }

    function test_releaseFor_wrongSignerRejected() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(bobPk, alice, deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.releaseFor(alice, deadline, sig);
        assertEq(reg.ownerOf("ada"), alice);
    }

    function test_releaseFor_expiredRejected() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.SignatureExpired.selector, deadline));
        reg.releaseFor(alice, deadline, sig);
    }

    function test_releaseFor_replayRejected() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);
        reg.releaseFor(alice, deadline, sig);

        vm.prank(alice);
        reg.register("ada");

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.releaseFor(alice, deadline, sig);
        assertEq(reg.ownerOf("ada"), alice);
    }

    function test_releaseFor_withoutHandleReverts() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.NoHandle.selector, alice));
        reg.releaseFor(alice, deadline, sig);
        assertEq(reg.nonces(alice), 0);
    }

    function test_releaseFor_registerSignatureNotAcceptedAsRelease() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory sig = _signRegister(alicePk, alice, "ada", deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.releaseFor(alice, deadline, sig);
    }

    /// Register and Release share one nonce per owner, so a signed release kills an
    /// outstanding register signature made against the same nonce.
    function test_sharedNonce_releaseForKillsPendingRegisterFor() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory pendingRegister = _signRegister(alicePk, alice, "lovelace", deadline);
        bytes memory releaseSig = _signRelease(alicePk, alice, deadline);

        reg.releaseFor(alice, deadline, releaseSig);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "lovelace", deadline, pendingRegister);
    }

    /// A Release that reverted `NoHandle` leaves its nonce unspent. It names no handle, so
    /// were the direct register to leave the nonce alone too, it would release whatever
    /// alice registered next.
    function test_releaseFor_failedSignatureCannotReleaseALaterHandle() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signRelease(alicePk, alice, deadline);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.NoHandle.selector, alice));
        reg.releaseFor(alice, deadline, sig);

        vm.prank(alice);
        reg.register("ada");

        HandleThief thief = new HandleThief(reg);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        thief.viaRelease(alice, deadline, sig, "ada");
        assertEq(reg.ownerOf("ada"), alice);
    }

    // ---------------------------------------------------------------------
    // cancel / cancelFor
    // ---------------------------------------------------------------------

    function test_cancel_killsPendingSignaturesAndKeepsTheHandle() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory pendingRegister = _signRegister(alicePk, alice, "lovelace", deadline);
        bytes memory pendingRelease = _signRelease(alicePk, alice, deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.NonceCancelled(alice, 1);
        vm.prank(alice);
        reg.cancel();

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "lovelace", deadline, pendingRegister);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.releaseFor(alice, deadline, pendingRelease);

        assertEq(reg.handleOf(alice), "ada");
        assertEq(reg.nonces(alice), 2);
    }

    /// The gasless way out of a stalled change: the relayer submits alice's Cancel, and the
    /// Register still waiting somewhere can never land.
    function test_cancelFor_gaslessOwnerKillsAStalledRegister() public {
        uint256 deadline = _deadline();
        bytes memory first = _signRegister(alicePk, alice, "ada", deadline);
        vm.prank(relayer);
        reg.registerFor(alice, "ada", deadline, first);

        bytes memory stalled = _signRegister(alicePk, alice, "lovelace", deadline);
        bytes memory cancelSig = _signCancel(alicePk, alice, deadline);

        vm.expectEmit(true, false, false, true, address(reg));
        emit HandleRegistry.NonceCancelled(alice, 1);
        vm.prank(relayer);
        reg.cancelFor(alice, deadline, cancelSig);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.registerFor(alice, "lovelace", deadline, stalled);
        assertEq(reg.handleOf(alice), "ada");
        assertEq(reg.ownerOf("lovelace"), address(0));

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.cancelFor(alice, deadline, cancelSig); // single-use like the rest
    }

    function test_cancelFor_worksWithoutAHandle() public {
        uint256 deadline = _deadline();
        reg.cancelFor(alice, deadline, _signCancel(alicePk, alice, deadline));
        assertEq(reg.nonces(alice), 1);
    }

    function test_cancelFor_wrongSignerRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signCancel(bobPk, alice, deadline);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.cancelFor(alice, deadline, sig);
        assertEq(reg.nonces(alice), 0);
    }

    function test_cancelFor_expiredRejected() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signCancel(alicePk, alice, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.SignatureExpired.selector, deadline));
        reg.cancelFor(alice, deadline, sig);
    }

    /// Release and Cancel carry the same fields; the typehash is what keeps a Cancel from
    /// being submitted as a Release, which would give the handle up.
    function test_cancelFor_typesAreNotInterchangeable() public {
        vm.prank(alice);
        reg.register("ada");
        uint256 deadline = _deadline();
        bytes memory cancelSig = _signCancel(alicePk, alice, deadline);
        bytes memory releaseSig = _signRelease(alicePk, alice, deadline);

        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.releaseFor(alice, deadline, cancelSig);
        vm.expectRevert(abi.encodeWithSelector(HandleRegistry.InvalidSignature.selector, alice));
        reg.cancelFor(alice, deadline, releaseSig);
        assertEq(reg.ownerOf("ada"), alice);
    }

    // ---------------------------------------------------------------------
    // Property: the two mappings stay each other's inverse
    // ---------------------------------------------------------------------

    function testFuzz_mappingsStayInverse(uint8[24] calldata ops) public {
        address[3] memory actors = [alice, bob, relayer];
        string[4] memory names = ["ada", "bob", "cyd", "dee"];

        for (uint256 i; i < ops.length; ++i) {
            address actor = actors[ops[i] % 3];
            uint256 action = (ops[i] / 3) % 5; // 0-3 register names[action], 4 release
            uint256 nonceBefore = reg.nonces(actor);
            bool landed = true;
            vm.prank(actor);
            if (action == 4) {
                try reg.release() {}
                catch {
                    landed = false;
                }
            } else {
                try reg.register(names[action]) {}
                catch {
                    landed = false;
                }
            }
            // the nonce moves exactly when the handle state does
            assertEq(reg.nonces(actor), nonceBefore + (landed ? 1 : 0), "nonce");

            for (uint256 a; a < actors.length; ++a) {
                string memory h = reg.handleOf(actors[a]);
                if (bytes(h).length != 0) assertEq(reg.ownerOf(h), actors[a], "handleOf -> ownerOf");
            }
            for (uint256 n; n < names.length; ++n) {
                address o = reg.ownerOf(names[n]);
                if (o != address(0)) assertEq(reg.handleOf(o), names[n], "ownerOf -> handleOf");
            }
        }
    }
}
