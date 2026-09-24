// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ForkTest} from "../utils/ForkTest.sol";
import {MonadMainnet as M} from "../utils/MonadMainnet.sol";
import {ClaimEscrow} from "../../src/ClaimEscrow.sol";
import {IERC3009} from "../../src/interfaces/external/IERC3009.sol";

/// @title ClaimEscrowForkTest
/// @notice A claim link funded with real AUSD on a Monad mainnet fork: the sender signs a
///         real ERC-3009 `ReceiveWithAuthorization` naming the escrow and the derived nonce,
///         a relayer submits it, and the link's key claims to an account that did not
///         exist a moment ago.
/// @dev Env: MONAD_MAINNET_RPC_URL and MONAD_FORK_BLOCK, as for every fork test (see
///      ForkTest). The escrow reads no oracle, so any recent block will do.
contract ClaimEscrowForkTest is ForkTest {
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant CLAIM_TYPEHASH = keccak256("Claim(address claimSigner,address recipient)");
    bytes32 internal constant FUND_TYPEHASH =
        keccak256("Fund(address claimSigner,address token,address from,uint256 amount,uint64 expiry)");

    /// @dev Solady `InvalidSignature()`; AUSD bubbles it verbatim.
    bytes4 internal constant INVALID_SIGNATURE = 0x8baa579f;

    uint256 internal constant AMOUNT = 25e6; // 25 AUSD
    uint64 internal constant TTL = 30 days;

    /// @dev Regression guards for the relayer's gas limits, not targets. Monad bills the
    ///      limit rather than the usage (docs/INTEGRATION-FACTS.md §14.5), so these are the
    ///      numbers a limit is derived from. Measured cold on 2026-09-24 at the head
    ///      (MONAD_FORK_BLOCK=0, block ~107.6M): depositWithAuthorization 258,524, of which
    ///      about 9,300 is the link key's Fund signature, and claim 117,658. The guards sit
    ///      15-20% above, for variation in AUSD's cold pages.
    uint256 internal constant DEPOSIT_GAS_GUARD = 300_000;
    uint256 internal constant CLAIM_GAS_GUARD = 140_000;

    uint256 internal senderPk = 0xA11CE;
    address internal sender;
    address internal link;
    uint256 internal linkPk;
    address internal relayer = makeAddr("relayer");

    ClaimEscrow internal escrow;

    struct Terms {
        uint256 amount;
        address claimSigner;
        uint64 expiry;
        uint256 validBefore;
        bytes32 salt;
    }

    function setUp() public {
        _forkMainnet();
        sender = vm.addr(senderPk);
        (link, linkPk) = makeAddrAndKey("claim link");
        escrow = new ClaimEscrow();
        _dealAUSD(sender, 1_000e6);
    }

    // =====================================================================
    // helpers
    // =====================================================================

    function _terms(bytes32 salt) internal view returns (Terms memory) {
        return Terms({
            amount: AMOUNT,
            claimSigner: link,
            expiry: uint64(block.timestamp + TTL),
            validBefore: block.timestamp + 1 hours,
            salt: salt
        });
    }

    /// @dev Built against AUSD's real on-chain DOMAIN_SEPARATOR, with validAfter 0 and the
    ///      nonce the escrow derives from the terms.
    function _signAuth(Terms memory t) internal view returns (bytes memory) {
        bytes32 nonce = escrow.depositNonce(M.AUSD, sender, t.amount, t.claimSigner, t.expiry, t.salt);
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, sender, address(escrow), t.amount, uint256(0), t.validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", IERC3009(M.AUSD).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(senderPk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev The escrow's EIP-712 digest for `structHash`, from the domain it reports.
    function _escrowDigest(bytes32 structHash) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            escrow.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), chainId, verifyingContract
            )
        );
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function _signClaim(address to) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(linkPk, _escrowDigest(keccak256(abi.encode(CLAIM_TYPEHASH, link, to))));
        return abi.encodePacked(r, s, v);
    }

    /// @dev The link key's consent to funding `claimSigner` on terms `t`, as the app signs it.
    function _signFund(uint256 claimKey, address claimSigner, Terms memory t) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(FUND_TYPEHASH, claimSigner, M.AUSD, sender, t.amount, t.expiry));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimKey, _escrowDigest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _deposit(Terms memory t, bytes memory auth) internal returns (uint256 gasUsed) {
        bytes memory fundSig = _signFund(linkPk, t.claimSigner, t);
        vm.prank(relayer);
        uint256 before = gasleft();
        escrow.depositWithAuthorization(
            M.AUSD, sender, t.amount, t.claimSigner, t.expiry, t.validBefore, t.salt, auth, fundSig
        );
        gasUsed = before - gasleft();
    }

    // =====================================================================
    // tests
    // =====================================================================

    /// @dev The whole link on real AUSD: a gasless sender funds it, and a brand-new account
    ///      receives exactly what was sent. Nobody but the relayer ever sends a transaction.
    function testFork_ausd_depositWithAuthorizationThenClaim() public {
        bytes32 builtDomain = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("Agora Dollar"), keccak256("1"), uint256(143), M.AUSD)
        );
        assertEq(IERC3009(M.AUSD).DOMAIN_SEPARATOR(), builtDomain, "AUSD domain is Agora Dollar / 1");

        Terms memory t = _terms(keccak256("fork:link"));
        bytes32 nonce = escrow.depositNonce(M.AUSD, sender, t.amount, t.claimSigner, t.expiry, t.salt);
        uint256 senderBefore = IERC20(M.AUSD).balanceOf(sender);

        uint256 depositGas = _deposit(t, _signAuth(t));

        assertEq(senderBefore - IERC20(M.AUSD).balanceOf(sender), AMOUNT, "sender debited exactly");
        assertEq(IERC20(M.AUSD).balanceOf(address(escrow)), AMOUNT, "escrow holds it");
        assertTrue(IERC3009(M.AUSD).authorizationState(sender, nonce), "AUSD nonce spent");
        ClaimEscrow.Deposit memory d = escrow.depositOf(link);
        assertEq(d.token, M.AUSD);
        assertEq(d.from, sender);
        assertEq(d.amount, AMOUNT, "recorded == arrived; AUSD takes no fee");
        assertEq(d.expiry, t.expiry);

        address fresh = makeAddr("fresh account");
        assertEq(IERC20(M.AUSD).balanceOf(fresh), 0, "fresh account starts empty");
        assertEq(fresh.code.length, 0, "fresh account has no code");

        bytes memory claimSig = _signClaim(fresh);
        vm.prank(relayer);
        uint256 before = gasleft();
        escrow.claim(link, fresh, claimSig);
        uint256 claimGas = before - gasleft();

        assertEq(IERC20(M.AUSD).balanceOf(fresh), AMOUNT, "fresh account paid in full");
        assertEq(IERC20(M.AUSD).balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(IERC20(M.AUSD).balanceOf(relayer), 0, "relayer never touches the money");
        assertEq(escrow.depositOf(link).from, address(0), "deposit gone");
        assertTrue(escrow.used(link), "link spent for good");

        console2.log("gas: depositWithAuthorization (real AUSD, cold):", depositGas);
        console2.log("gas: claim (real AUSD, cold):", claimGas);
        assertLt(depositGas, DEPOSIT_GAS_GUARD, "deposit gas regressed");
        assertLt(claimGas, CLAIM_GAS_GUARD, "claim gas regressed");
    }

    /// @dev A relayer that re-files the sender's authorization under a link it holds the
    ///      key to is refused by AUSD itself, because the claimSigner is inside the nonce.
    ///      Holding that link's key gets it past the escrow's Fund check; AUSD still says no.
    function testFork_ausd_relayerCannotRefileUnderItsOwnLink() public {
        Terms memory t = _terms(keccak256("fork:tamper"));
        bytes memory auth = _signAuth(t);
        bytes32 signedNonce = escrow.depositNonce(M.AUSD, sender, t.amount, t.claimSigner, t.expiry, t.salt);

        (address relayersLink, uint256 relayersLinkPk) = makeAddrAndKey("relayer's link");
        bytes memory relayersFundSig = _signFund(relayersLinkPk, relayersLink, t);
        uint256 senderBefore = IERC20(M.AUSD).balanceOf(sender);

        // When ecrecover does not return the sender, AUSD falls back to an ERC-1271
        // staticcall on it, which Foundry cannot represent against a codeless account in a
        // fork. Empty runtime code reproduces an EOA as AUSD reads one and lets the real
        // revert through; see Settlement.fork.t.sol, testFork_pathA_tamperedIntentRevertsAtToken.
        vm.etch(sender, hex"00");
        vm.prank(relayer);
        vm.expectRevert(INVALID_SIGNATURE);
        escrow.depositWithAuthorization(
            M.AUSD, sender, t.amount, relayersLink, t.expiry, t.validBefore, t.salt, auth, relayersFundSig
        );

        assertEq(IERC20(M.AUSD).balanceOf(sender), senderBefore, "nothing moved");
        assertFalse(IERC3009(M.AUSD).authorizationState(sender, signedNonce), "the signed nonce is still unspent");
        assertFalse(escrow.used(relayersLink), "no link was opened");
    }

    /// @dev A link nobody opens comes home: after expiry anyone may send it back.
    function testFork_ausd_unclaimedLinkRefundsAfterExpiry() public {
        Terms memory t = _terms(keccak256("fork:refund"));
        uint256 senderBefore = IERC20(M.AUSD).balanceOf(sender);
        _deposit(t, _signAuth(t));

        vm.warp(t.expiry);
        vm.prank(makeAddr("anyone"));
        escrow.refund(link);

        assertEq(IERC20(M.AUSD).balanceOf(sender), senderBefore, "sender whole again");
        assertEq(IERC20(M.AUSD).balanceOf(address(escrow)), 0, "escrow empty");
    }
}
