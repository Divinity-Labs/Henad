// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC3009Token} from "./mocks/MockERC3009Token.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";
import {BareDelegate} from "./mocks/BareDelegate.sol";

/// Burns 1% of every transfer between two accounts, so what arrives is less than what
/// was sent, both into the escrow and out of it.
contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("Fee on transfer", "FEE", 6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
        } else {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        }
    }
}

/// Once armed, calls back into `target` from inside its own transfer the first time the
/// target sends or receives it, and keeps the outcome instead of bubbling it, so the test
/// can see both that the outer call finished and why the inner one did not.
contract ReentrantToken is MockERC20 {
    address public target;
    bytes public payload;
    bool public attempted;
    bool public reentered;
    bytes public reentryRevert;

    constructor() MockERC20("Reentrant", "RE", 6) {}

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target == address(0) || attempted || (from != target && to != target)) return;
        attempted = true;
        (bool ok, bytes memory ret) = target.call(payload);
        reentered = ok;
        reentryRevert = ret;
    }
}

/// Charges its 1% fee on top: a transfer of `value` takes `value` plus the fee from the
/// sender and delivers all of `value`. Deposits arrive whole, but every payout costs the
/// escrow more than the deposit it pays. Unsupported, per the contract notes.
contract FeeOnTopToken is MockERC20 {
    constructor() MockERC20("Fee on top", "TOP", 6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) super._update(from, address(0), value / 100);
        super._update(from, to, value);
    }
}

/// Lets its issuer freeze an account, as AUSD's can: a frozen account can neither send
/// nor receive it.
contract FreezableToken is MockERC20 {
    mapping(address account => bool) public frozen;

    error AccountFrozen(address account);

    constructor() MockERC20("Freezable", "FRZ", 6) {}

    function freeze(address account, bool isFrozen) external {
        frozen[account] = isFrozen;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (frozen[from]) revert AccountFrozen(from);
        if (frozen[to]) revert AccountFrozen(to);
        super._update(from, to, value);
    }
}

/// Answers to the ERC-3009 calls the escrow makes and checks nothing: every authorization
/// is fresh, and receiving one mints its value to the caller. What a token written for the
/// purpose can make `depositWithAuthorization` record.
contract UncheckedAuthorizationToken is MockERC20 {
    constructor() MockERC20("Unchecked", "UNC", 6) {}

    function authorizationState(address, bytes32) external pure returns (bool) {
        return false;
    }

    function receiveWithAuthorization(address, address to, uint256 value, uint256, uint256, bytes32, bytes calldata)
        external
    {
        _mint(to, value);
    }
}

contract ClaimEscrowTest is Test {
    /// Every term of a `depositWithAuthorization` call, so a test can sign one set and
    /// submit another.
    struct Terms {
        address token;
        address from;
        uint256 amount;
        address claimSigner;
        uint64 expiry;
        uint256 validBefore;
        bytes32 salt;
    }

    uint256 internal constant T0 = 1_789_000_000;
    uint256 internal constant AMOUNT = 250e6; // 250 AUSD
    uint64 internal constant TTL = 7 days;

    bytes32 internal constant CLAIM_TYPEHASH = keccak256("Claim(address claimSigner,address recipient)");
    bytes32 internal constant CANCEL_TYPEHASH = keccak256("Cancel(address claimSigner,uint256 deadline)");
    bytes32 internal constant FUND_TYPEHASH =
        keccak256("Fund(address claimSigner,address token,address from,uint256 amount,uint64 expiry)");

    ClaimEscrow internal escrow;
    MockERC3009Token internal ausd;

    address internal sender;
    uint256 internal senderPk;
    address internal link; // the claimSigner; its key is what the link's fragment carries
    uint256 internal linkPk;
    address internal recipient = makeAddr("recipient");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    /// The key behind every link a test made, so a helper can sign its Fund the way the
    /// sender's app would.
    mapping(address claimSigner => uint256 pk) internal keyOf;

    function setUp() public {
        vm.warp(T0);
        escrow = new ClaimEscrow();
        ausd = new MockERC3009Token("Mock AUSD", "mAUSD", 6);
        (sender, senderPk) = makeAddrAndKey("sender");
        (link, linkPk) = _newLink("link");
        ausd.mint(sender, 1_000e6);
    }

    function _newLink(string memory name) internal returns (address claimSigner, uint256 pk) {
        (claimSigner, pk) = makeAddrAndKey(name);
        keyOf[claimSigner] = pk;
    }

    // ---------------------------------------------------------------------
    // EIP-712 and ERC-3009 helpers, computed by hand so a client implementation has a vector
    // ---------------------------------------------------------------------

    function _domainSeparator(address escrow_) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Henad Claims"),
                keccak256("1"),
                block.chainid,
                escrow_
            )
        );
    }

    function _claimDigest(address escrow_, address claimSigner, address to) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, claimSigner, to));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(escrow_), structHash));
    }

    function _cancelDigest(address claimSigner, uint256 deadline) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CANCEL_TYPEHASH, claimSigner, deadline));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(escrow)), structHash));
    }

    function _fundDigest(address claimSigner, address token, address from, uint256 amount, uint64 expiry)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(FUND_TYPEHASH, claimSigner, token, from, amount, expiry));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(escrow)), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// The link key's consent to one funding, as the sender's app signs it. Empty for a
    /// claimSigner the test holds no key for, such as zero.
    function _signFund(address claimSigner, address token, address from, uint256 amount, uint64 expiry)
        internal
        view
        returns (bytes memory)
    {
        uint256 pk = keyOf[claimSigner];
        if (pk == 0) return "";
        return _sign(pk, _fundDigest(claimSigner, token, from, amount, expiry));
    }

    function _signClaim(uint256 pk, address claimSigner, address to) internal view returns (bytes memory) {
        return _sign(pk, _claimDigest(address(escrow), claimSigner, to));
    }

    function _signCancel(uint256 pk, address claimSigner, uint256 deadline) internal view returns (bytes memory) {
        return _sign(pk, _cancelDigest(claimSigner, deadline));
    }

    function _expiry() internal view returns (uint64) {
        return uint64(block.timestamp + TTL);
    }

    function _terms() internal view returns (Terms memory) {
        return Terms({
            token: address(ausd),
            from: sender,
            amount: AMOUNT,
            claimSigner: link,
            expiry: _expiry(),
            validBefore: block.timestamp + 1 hours,
            salt: keccak256("salt")
        });
    }

    /// The nonce the sender's app computes before signing.
    function _nonce(Terms memory t) internal view returns (bytes32) {
        return keccak256(
            abi.encode(address(escrow), block.chainid, t.token, t.from, t.amount, t.claimSigner, t.expiry, t.salt)
        );
    }

    /// ERC-3009 ReceiveWithAuthorization exactly as the sender's app will sign it.
    function _signAuth(uint256 pk, Terms memory t) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                ausd.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                t.from,
                address(escrow),
                t.amount,
                uint256(0),
                t.validBefore,
                _nonce(t)
            )
        );
        return _sign(pk, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash)));
    }

    function _submit(Terms memory t, bytes memory sig) internal returns (uint256) {
        bytes memory fundSig = _signFund(t.claimSigner, t.token, t.from, t.amount, t.expiry);
        vm.prank(relayer);
        return
            escrow.depositWithAuthorization(
                t.token, t.from, t.amount, t.claimSigner, t.expiry, t.validBefore, t.salt, sig, fundSig
            );
    }

    /// The default link: the sender's signed authorization, submitted by the relayer.
    function _fund() internal returns (Terms memory t) {
        t = _terms();
        _submit(t, _signAuth(senderPk, t));
    }

    /// A direct deposit of `amount` of `token` by `who`, under `claimSigner`.
    function _depositAs(address who, MockERC20 token, uint256 amount, address claimSigner) internal returns (uint256) {
        bytes memory fundSig = _signFund(claimSigner, address(token), who, amount, _expiry());
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(escrow), amount);
        uint256 received = escrow.deposit(address(token), amount, claimSigner, _expiry(), fundSig);
        vm.stopPrank();
        return received;
    }

    function _claim(address claimSigner, uint256 pk, address to) internal {
        bytes memory sig = _signClaim(pk, claimSigner, to);
        vm.prank(relayer);
        escrow.claim(claimSigner, to, sig);
    }

    function _assertGone(address claimSigner) internal view {
        ClaimEscrow.Deposit memory d = escrow.depositOf(claimSigner);
        assertEq(d.token, address(0), "deposit.token cleared");
        assertEq(d.from, address(0), "deposit.from cleared");
        assertEq(d.amount, 0, "deposit.amount cleared");
        assertEq(d.expiry, 0, "deposit.expiry cleared");
        assertTrue(escrow.used(claimSigner), "claimSigner stays used");
    }

    // ---------------------------------------------------------------------
    // Domain, typehashes, nonce
    // ---------------------------------------------------------------------

    function test_typehashes_matchSpec() public view {
        assertEq(escrow.CLAIM_TYPEHASH(), CLAIM_TYPEHASH);
        assertEq(escrow.CANCEL_TYPEHASH(), CANCEL_TYPEHASH);
        assertEq(escrow.FUND_TYPEHASH(), FUND_TYPEHASH);
        assertEq(escrow.MAX_EXPIRY(), 90 days);
    }

    function test_domain_isHenadClaimsV1BoundToThisChainAndContract() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            escrow.eip712Domain();
        assertEq(name, "Henad Claims");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(escrow));
    }

    function test_depositNonce_matchesHandComputed() public view {
        Terms memory t = _terms();
        assertEq(escrow.depositNonce(t.token, t.from, t.amount, t.claimSigner, t.expiry, t.salt), _nonce(t));
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// The whole story: a gasless sender funds a link, the relayer submits it, the person
    /// who opens the link signs a claim naming their new account, the relayer submits that.
    function test_lifecycle_authorizationThenClaim() public {
        Terms memory t = _terms();
        bytes memory auth = _signAuth(senderPk, t);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Deposited(link, address(ausd), sender, AMOUNT, t.expiry);
        uint256 received = _submit(t, auth);

        assertEq(received, AMOUNT, "received");
        assertEq(ausd.balanceOf(sender), 1_000e6 - AMOUNT, "sender debited");
        assertEq(ausd.balanceOf(address(escrow)), AMOUNT, "escrow holds it");
        assertTrue(ausd.authorizationState(sender, _nonce(t)), "nonce spent at the token");
        assertTrue(escrow.used(link), "claimSigner used");

        ClaimEscrow.Deposit memory d = escrow.depositOf(link);
        assertEq(d.token, address(ausd));
        assertEq(d.from, sender);
        assertEq(d.amount, AMOUNT);
        assertEq(d.expiry, t.expiry);

        address newAccount = makeAddr("newAccount");
        bytes memory claimSig = _signClaim(linkPk, link, newAccount);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Claimed(link, newAccount, AMOUNT);
        vm.prank(relayer);
        escrow.claim(link, newAccount, claimSig);

        assertEq(ausd.balanceOf(newAccount), AMOUNT, "new account paid");
        assertEq(ausd.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(ausd.balanceOf(relayer), 0, "relayer never touches the money");
        _assertGone(link);
    }

    function test_lifecycle_directDepositThenRefund() public {
        uint64 expiry = _expiry();
        bytes memory fundSig = _signFund(link, address(ausd), sender, AMOUNT, expiry);
        vm.startPrank(sender);
        ausd.approve(address(escrow), AMOUNT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Deposited(link, address(ausd), sender, AMOUNT, expiry);
        escrow.deposit(address(ausd), AMOUNT, link, expiry, fundSig);
        vm.stopPrank();
        assertEq(ausd.balanceOf(sender), 1_000e6 - AMOUNT);

        vm.warp(expiry);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Returned(link, sender, AMOUNT, true);
        vm.prank(stranger);
        escrow.refund(link);

        assertEq(ausd.balanceOf(sender), 1_000e6, "sender whole again");
        assertEq(ausd.balanceOf(stranger), 0);
        assertEq(ausd.balanceOf(address(escrow)), 0);
        _assertGone(link);
    }

    function test_lifecycle_cancelReturnsToSender() public {
        _fund();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Returned(link, sender, AMOUNT, false);
        vm.prank(sender);
        escrow.cancel(link);

        assertEq(ausd.balanceOf(sender), 1_000e6);
        assertEq(ausd.balanceOf(address(escrow)), 0);
        _assertGone(link);
    }

    /// Deposits in one token are kept apart: ending one leaves the other whole.
    function test_twoLinks_sameToken_areIndependent() public {
        _fund();
        (address link2, uint256 link2Pk) = _newLink("link2");
        _depositAs(stranger, ausd, 40e6, link2);
        assertEq(ausd.balanceOf(address(escrow)), AMOUNT + 40e6);

        _claim(link, linkPk, recipient);
        assertEq(ausd.balanceOf(address(escrow)), 40e6, "the other link's money is untouched");
        assertEq(escrow.depositOf(link2).amount, 40e6);

        _claim(link2, link2Pk, recipient);
        assertEq(ausd.balanceOf(recipient), AMOUNT + 40e6);
        assertEq(ausd.balanceOf(address(escrow)), 0);
    }

    // ---------------------------------------------------------------------
    // The nonce binds the terms: a relayer cannot re-file an authorization
    // ---------------------------------------------------------------------

    /// The relayer holds a valid authorization and submits it with one term changed. The
    /// changed term changes the nonce, the sender's signature no longer recovers, and the
    /// token refuses it: the token rejects it, not the escrow. The relayer is given a
    /// valid Fund signature for what it submits, as if it held the link's key too, so the
    /// token's check is shown to hold on its own.
    function _expectTokenRejects(Terms memory signed, Terms memory submitted) internal {
        bytes memory sig = _signAuth(senderPk, signed);
        bytes memory fundSig =
            _signFund(submitted.claimSigner, submitted.token, submitted.from, submitted.amount, submitted.expiry);
        vm.prank(relayer);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        escrow.depositWithAuthorization(
            submitted.token,
            submitted.from,
            submitted.amount,
            submitted.claimSigner,
            submitted.expiry,
            submitted.validBefore,
            submitted.salt,
            sig,
            fundSig
        );
        assertEq(ausd.balanceOf(sender), 1_000e6, "nothing moved");
        assertEq(ausd.balanceOf(address(escrow)), 0, "escrow empty");
        assertFalse(ausd.authorizationState(sender, _nonce(signed)), "the signed nonce is still unspent");
        assertFalse(escrow.used(submitted.claimSigner), "no claimSigner consumed");
    }

    function test_depositWithAuthorization_relayerCannotAlterAmount() public {
        Terms memory signed = _terms();
        Terms memory submitted = _terms();
        submitted.amount = AMOUNT - 1;
        _expectTokenRejects(signed, submitted);
    }

    /// The attack the nonce binding exists for: file the sender's money under a link the
    /// relayer holds the key to, then claim it.
    function test_depositWithAuthorization_relayerCannotAlterClaimSigner() public {
        Terms memory signed = _terms();
        Terms memory submitted = _terms();
        (submitted.claimSigner,) = _newLink("relayer's own link");
        _expectTokenRejects(signed, submitted);
    }

    function test_depositWithAuthorization_relayerCannotAlterExpiry() public {
        Terms memory signed = _terms();
        Terms memory submitted = _terms();
        submitted.expiry = signed.expiry + 1 days;
        _expectTokenRejects(signed, submitted);
    }

    function test_depositWithAuthorization_relayerCannotAlterSalt() public {
        Terms memory signed = _terms();
        Terms memory submitted = _terms();
        submitted.salt = keccak256("other salt");
        _expectTokenRejects(signed, submitted);
    }

    function test_depositWithAuthorization_relayerCannotAlterValidBefore() public {
        Terms memory signed = _terms();
        Terms memory submitted = _terms();
        submitted.validBefore = signed.validBefore + 1;
        _expectTokenRejects(signed, submitted);
    }

    /// A sender with no MON cancels at the token instead; the escrow's pre-check then
    /// reports it in its own words before calling the token.
    function test_depositWithAuthorization_cancelledAtTokenRevertsAuthorizationUsed() public {
        Terms memory t = _terms();
        bytes32 nonce = _nonce(t);
        bytes memory auth = _signAuth(senderPk, t);

        bytes32 cancelHash = keccak256(abi.encode(ausd.CANCEL_AUTHORIZATION_TYPEHASH(), sender, nonce));
        ausd.cancelAuthorization(
            sender, nonce, _sign(senderPk, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), cancelHash)))
        );

        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.AuthorizationUsed.selector, nonce));
        _submit(t, auth);
        assertFalse(escrow.used(link), "claimSigner still free");
    }

    function test_depositWithAuthorization_lapsedAuthorizationRevertsAtToken() public {
        Terms memory t = _terms();
        bytes memory auth = _signAuth(senderPk, t);
        vm.warp(t.validBefore);
        vm.expectRevert(MockERC3009Token.AuthorizationExpired.selector);
        _submit(t, auth);
    }

    function test_depositWithAuthorization_zeroFromReverts() public {
        Terms memory t = _terms();
        t.from = address(0);
        bytes memory auth = _signAuth(senderPk, t);
        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        _submit(t, auth);
    }

    // ---------------------------------------------------------------------
    // Funding checks
    // ---------------------------------------------------------------------

    /// With a valid Fund signature wherever the test holds the link's key, so the revert
    /// is the check under test and not the signature.
    function _expectDepositReverts(address token, uint256 amount, address claimSigner, uint64 expiry, bytes memory err)
        internal
    {
        bytes memory fundSig = _signFund(claimSigner, token, sender, amount, expiry);
        vm.startPrank(sender);
        ausd.approve(address(escrow), type(uint256).max);
        vm.expectRevert(err);
        escrow.deposit(token, amount, claimSigner, expiry, fundSig);
        vm.stopPrank();
    }

    function test_deposit_zeroClaimSignerReverts() public {
        _expectDepositReverts(
            address(ausd), AMOUNT, address(0), _expiry(), abi.encodeWithSelector(ClaimEscrow.ZeroAddress.selector)
        );
    }

    function test_deposit_zeroTokenReverts() public {
        _expectDepositReverts(
            address(0), AMOUNT, link, _expiry(), abi.encodeWithSelector(ClaimEscrow.ZeroAddress.selector)
        );
    }

    function test_deposit_expiryMustBeInTheFuture() public {
        uint64 nowTs = uint64(block.timestamp);
        _expectDepositReverts(
            address(ausd), AMOUNT, link, nowTs, abi.encodeWithSelector(ClaimEscrow.InvalidExpiry.selector, nowTs)
        );
        _expectDepositReverts(
            address(ausd),
            AMOUNT,
            link,
            nowTs - 1,
            abi.encodeWithSelector(ClaimEscrow.InvalidExpiry.selector, nowTs - 1)
        );
    }

    function test_deposit_expiryAtMostNinetyDays() public {
        uint64 max = uint64(block.timestamp) + 90 days;
        _expectDepositReverts(
            address(ausd), AMOUNT, link, max + 1, abi.encodeWithSelector(ClaimEscrow.InvalidExpiry.selector, max + 1)
        );

        bytes memory fundSig = _signFund(link, address(ausd), sender, AMOUNT, max);
        vm.startPrank(sender);
        ausd.approve(address(escrow), AMOUNT);
        escrow.deposit(address(ausd), AMOUNT, link, max, fundSig);
        vm.stopPrank();
        assertEq(escrow.depositOf(link).expiry, max, "exactly MAX_EXPIRY is allowed");
    }

    function test_deposit_zeroAmountReverts() public {
        _expectDepositReverts(
            address(ausd), 0, link, _expiry(), abi.encodeWithSelector(ClaimEscrow.ZeroAmount.selector)
        );
    }

    /// The stored amount is a uint128; one unit more than fits is refused, not truncated.
    function test_deposit_amountAboveUint128Reverts() public {
        uint256 tooMuch = uint256(type(uint128).max) + 1;
        MockERC20 big = new MockERC20("Big", "BIG", 18);
        big.mint(sender, tooMuch);
        bytes memory fundSig = _signFund(link, address(big), sender, tooMuch, _expiry());
        vm.startPrank(sender);
        big.approve(address(escrow), tooMuch);
        vm.expectRevert(ClaimEscrow.ValueOverflow.selector);
        escrow.deposit(address(big), tooMuch, link, _expiry(), fundSig);
        vm.stopPrank();

        assertEq(_depositAs(sender, big, type(uint128).max, link), type(uint128).max, "uint128 max itself fits");
        assertEq(escrow.depositOf(link).amount, type(uint128).max);
    }

    function test_deposit_liveClaimSignerReverts() public {
        _fund();
        _expectDepositReverts(
            address(ausd), 1e6, link, _expiry(), abi.encodeWithSelector(ClaimEscrow.ClaimSignerUsed.selector, link)
        );
    }

    // ---------------------------------------------------------------------
    // Only the link's key opens a deposit under it
    // ---------------------------------------------------------------------

    /// The squat the Fund signature closes. The sender's funding is in flight, so its
    /// claimSigner and both its signatures are public. Before the Fund check, a watcher
    /// could deposit 1 unit (or a token of their own) under that claimSigner first, make
    /// the sender's transaction revert `ClaimSignerUsed`, cancel, and do it again to every
    /// retry. Now none of their ways in works, and the sender's transaction lands.
    function test_fund_onlyTheLinksKeyOpensADepositUnderIt() public {
        Terms memory t = _terms();
        bytes memory auth = _signAuth(senderPk, t);
        bytes memory sendersFundSig = _signFund(link, address(ausd), sender, AMOUNT, t.expiry);
        (, uint256 strangerPk) = makeAddrAndKey("stranger key");
        bytes memory strangersOwnSig = _sign(strangerPk, _fundDigest(link, address(ausd), stranger, 1, t.expiry));

        ausd.mint(stranger, AMOUNT);
        vm.startPrank(stranger);
        ausd.approve(address(escrow), AMOUNT);
        // The sender's Fund signature names the sender, and here `from` is the stranger. Same
        // token, same amount, same expiry: `from` is the only term that differs, so this
        // reverts only because the signature binds it. The squat this closes is a watcher
        // funding the full amount from their own balance under the sender's signature.
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.deposit(address(ausd), AMOUNT, link, t.expiry, sendersFundSig);
        // and no other key speaks for the link
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.deposit(address(ausd), 1, link, t.expiry, strangersOwnSig);
        vm.stopPrank();

        // a token written to credit the escrow without anyone signing: the Fund names AUSD
        UncheckedAuthorizationToken fake = new UncheckedAuthorizationToken();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.depositWithAuthorization(
            address(fake), sender, AMOUNT, link, t.expiry, t.validBefore, t.salt, "", sendersFundSig
        );

        assertFalse(escrow.used(link), "the link is still free");
        assertFalse(ausd.authorizationState(sender, _nonce(t)), "the sender's authorization is unspent");

        // resubmitted by anyone as it stands, the sender's transaction funds the sender's deposit
        vm.prank(stranger);
        escrow.depositWithAuthorization(
            t.token, t.from, t.amount, t.claimSigner, t.expiry, t.validBefore, t.salt, auth, sendersFundSig
        );
        ClaimEscrow.Deposit memory d = escrow.depositOf(link);
        assertEq(d.token, address(ausd));
        assertEq(d.from, sender);
        assertEq(d.amount, AMOUNT);
    }

    /// Signed for one funding, the Fund signature opens nothing on any other terms.
    function test_fund_signatureCoversEveryTerm() public {
        uint64 expiry = _expiry();
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        bytes[5] memory wrong = [
            _signFund(link, address(other), sender, AMOUNT, expiry), // token
            _signFund(link, address(ausd), stranger, AMOUNT, expiry), // from
            _signFund(link, address(ausd), sender, AMOUNT + 1, expiry), // amount
            _signFund(link, address(ausd), sender, AMOUNT, expiry + 1), // expiry
            _signClaim(linkPk, link, sender) // another type from the same key
        ];

        vm.startPrank(sender);
        ausd.approve(address(escrow), AMOUNT);
        for (uint256 i; i < wrong.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
            escrow.deposit(address(ausd), AMOUNT, link, expiry, wrong[i]);
        }
        escrow.deposit(address(ausd), AMOUNT, link, expiry, _signFund(link, address(ausd), sender, AMOUNT, expiry));
        vm.stopPrank();
        assertEq(escrow.depositOf(link).amount, AMOUNT, "the right one still works");
    }

    // ---------------------------------------------------------------------
    // One deposit per claimSigner, ever
    // ---------------------------------------------------------------------

    function _expectReuseRefused() internal {
        _expectDepositReverts(
            address(ausd), 1e6, link, _expiry(), abi.encodeWithSelector(ClaimEscrow.ClaimSignerUsed.selector, link)
        );
        Terms memory t = _terms();
        t.salt = keccak256("fresh salt, same link");
        bytes memory auth = _signAuth(senderPk, t);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.ClaimSignerUsed.selector, link));
        _submit(t, auth);
    }

    /// The first claim signature is public in calldata for good. If the link could be
    /// funded again, that signature would replay and pay the new money to the old account.
    function test_reuse_refusedAfterClaim() public {
        _fund();
        bytes memory oldClaim = _signClaim(linkPk, link, recipient);
        vm.prank(relayer);
        escrow.claim(link, recipient, oldClaim);

        _expectReuseRefused();

        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.claim(link, recipient, oldClaim);
    }

    function test_reuse_refusedAfterCancel() public {
        _fund();
        vm.prank(sender);
        escrow.cancel(link);
        _expectReuseRefused();
    }

    function test_reuse_refusedAfterRefund() public {
        _fund();
        vm.warp(_terms().expiry + TTL);
        escrow.refund(link);
        _expectReuseRefused();
    }

    // ---------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------

    function test_claim_wrongSignerReverts() public {
        _fund();
        (, uint256 otherPk) = makeAddrAndKey("not the link");
        bytes memory sig = _signClaim(otherPk, link, recipient);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.claim(link, recipient, sig);
        assertEq(escrow.depositOf(link).amount, AMOUNT, "still waiting");
    }

    /// Front-running: someone sees the claim in flight and resubmits it naming themselves.
    function test_claim_cannotBeRedirectedToAnotherRecipient() public {
        _fund();
        bytes memory sig = _signClaim(linkPk, link, recipient);
        address thief = makeAddr("thief");
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.claim(link, thief, sig);

        // Resubmitting it unchanged only pays the gas for the rightful recipient.
        vm.prank(thief);
        escrow.claim(link, recipient, sig);
        assertEq(ausd.balanceOf(recipient), AMOUNT);
        assertEq(ausd.balanceOf(thief), 0);
    }

    function test_claim_signatureForAnotherEscrowReverts() public {
        _fund();
        bytes memory sig = _sign(linkPk, _claimDigest(makeAddr("other escrow"), link, recipient));
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.claim(link, recipient, sig);
    }

    function test_claim_malformedSignatureReverts() public {
        _fund();
        bytes memory sig = _signClaim(linkPk, link, recipient);
        bytes memory short = new bytes(64);
        for (uint256 i; i < 64; ++i) {
            short[i] = sig[i];
        }
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, link));
        escrow.claim(link, recipient, short);
    }

    /// Claim is open strictly before expiry; at the expiry second it is refund's turn.
    function test_claim_atAndAfterExpiryReverts() public {
        Terms memory t = _fund();
        bytes memory sig = _signClaim(linkPk, link, recipient);

        vm.warp(t.expiry);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.DepositExpired.selector, link, t.expiry));
        escrow.claim(link, recipient, sig);

        vm.warp(t.expiry + 1 days);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.DepositExpired.selector, link, t.expiry));
        escrow.claim(link, recipient, sig);
    }

    function test_claim_lastSecondBeforeExpirySucceeds() public {
        Terms memory t = _fund();
        vm.warp(t.expiry - 1);
        _claim(link, linkPk, recipient);
        assertEq(ausd.balanceOf(recipient), AMOUNT);
    }

    function test_claim_toZeroReverts() public {
        _fund();
        bytes memory sig = _signClaim(linkPk, link, address(0));
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidRecipient.selector, address(0)));
        escrow.claim(link, address(0), sig);
    }

    /// There is no sweep, so money paid to the escrow itself would be stuck for good.
    function test_claim_toTheEscrowReverts() public {
        _fund();
        bytes memory sig = _signClaim(linkPk, link, address(escrow));
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidRecipient.selector, address(escrow)));
        escrow.claim(link, address(escrow), sig);
    }

    function test_claim_twiceReverts() public {
        _fund();
        _claim(link, linkPk, recipient);

        address second = makeAddr("second");
        bytes memory sig = _signClaim(linkPk, link, second);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.claim(link, second, sig);
        assertEq(ausd.balanceOf(recipient), AMOUNT, "paid once");
        assertEq(ausd.balanceOf(second), 0);
    }

    function test_claim_unknownLinkReverts() public {
        bytes memory sig = _signClaim(linkPk, link, recipient);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.claim(link, recipient, sig);
    }

    // ---------------------------------------------------------------------
    // Cancel
    // ---------------------------------------------------------------------

    function test_cancel_byNonDepositorReverts() public {
        _fund();
        address[3] memory others = [stranger, relayer, link];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NotDepositor.selector, others[i], sender));
            escrow.cancel(link);
        }
        assertEq(escrow.depositOf(link).amount, AMOUNT, "still waiting");
    }

    function test_cancel_afterExpiryReverts() public {
        Terms memory t = _fund();
        vm.warp(t.expiry);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.DepositExpired.selector, link, t.expiry));
        escrow.cancel(link);
    }

    function test_cancel_afterClaimReverts() public {
        _fund();
        _claim(link, linkPk, recipient);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.cancel(link);
    }

    // ---------------------------------------------------------------------
    // cancelWithSig
    // ---------------------------------------------------------------------

    function test_cancelWithSig_valid() public {
        _fund();
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signCancel(senderPk, link, deadline);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Returned(link, sender, AMOUNT, false);
        vm.prank(relayer);
        escrow.cancelWithSig(link, deadline, sig);

        assertEq(ausd.balanceOf(sender), 1_000e6);
        assertEq(ausd.balanceOf(relayer), 0);
        _assertGone(link);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.cancelWithSig(link, deadline, sig);
    }

    function test_cancelWithSig_deadlineIsInclusive() public {
        _fund();
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signCancel(senderPk, link, deadline);
        vm.warp(deadline);
        escrow.cancelWithSig(link, deadline, sig);
        assertEq(ausd.balanceOf(sender), 1_000e6);
    }

    function test_cancelWithSig_expiredReverts() public {
        _fund();
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signCancel(senderPk, link, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.SignatureExpired.selector, deadline));
        escrow.cancelWithSig(link, deadline, sig);
        assertEq(escrow.depositOf(link).amount, AMOUNT, "still waiting");
    }

    function test_cancelWithSig_wrongSignerReverts() public {
        _fund();
        uint256 deadline = block.timestamp + 600;
        // Neither a stranger nor the link's own key may cancel: only the sender.
        (, uint256 strangerPk) = makeAddrAndKey("stranger key");
        uint256[2] memory keys = [strangerPk, linkPk];
        for (uint256 i; i < keys.length; ++i) {
            bytes memory sig = _signCancel(keys[i], link, deadline);
            vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, sender));
            escrow.cancelWithSig(link, deadline, sig);
        }
    }

    function test_cancelWithSig_signatureNamesOneLinkOnly() public {
        _fund();
        (address link2,) = _newLink("link2");
        Terms memory t = _terms();
        t.claimSigner = link2;
        _submit(t, _signAuth(senderPk, t));

        uint256 deadline = block.timestamp + 600;
        bytes memory sigForLink2 = _signCancel(senderPk, link2, deadline);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, sender));
        escrow.cancelWithSig(link, deadline, sigForLink2);
    }

    function test_cancelWithSig_afterLinkExpiryReverts() public {
        Terms memory t = _fund();
        uint256 deadline = uint256(t.expiry) + 1 days;
        bytes memory sig = _signCancel(senderPk, link, deadline);
        vm.warp(t.expiry);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.DepositExpired.selector, link, t.expiry));
        escrow.cancelWithSig(link, deadline, sig);
    }

    /// A sender that is a contract account cancels through ERC-1271.
    function test_cancelWithSig_erc1271Sender() public {
        (address walletKey, uint256 walletKeyPk) = makeAddrAndKey("wallet key");
        MockERC1271Wallet wallet = new MockERC1271Wallet(walletKey);
        _depositAs(address(wallet), ausd, 30e6, link);
        assertEq(escrow.depositOf(link).from, address(wallet));

        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signCancel(walletKeyPk, link, deadline);
        vm.prank(relayer);
        escrow.cancelWithSig(link, deadline, sig);
        assertEq(ausd.balanceOf(address(wallet)), 30e6, "back to the wallet");
    }

    /// Henad senders are 7702-delegated EOAs. With a delegate that has no ERC-1271 at all,
    /// the sender's own key must still cancel, which is why ECDSA is tried first: a
    /// SignatureChecker-only check sends any account with code to ERC-1271 and would lock
    /// this sender out of cancelling without gas.
    function test_cancelWithSig_7702DelegatedEoaWithoutErc1271() public {
        BareDelegate delegate = new BareDelegate();
        vm.signAndAttachDelegation(address(delegate), senderPk);
        (bool ok,) = sender.call("");
        assertTrue(ok, "delegation tx failed");
        assertEq(sender.code.length, 23, "sender is delegated");

        _fund();
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signCancel(senderPk, link, deadline);
        assertFalse(
            SignatureChecker.isValidSignatureNow(sender, _cancelDigest(link, deadline), sig),
            "SignatureChecker alone rejects it"
        );

        vm.prank(relayer);
        escrow.cancelWithSig(link, deadline, sig);
        assertEq(ausd.balanceOf(sender), 1_000e6, "back to the sender");
        _assertGone(link);

        // and a stranger's key still cannot speak for the delegated sender
        (, uint256 strangerPk) = makeAddrAndKey("stranger key");
        (address link2,) = _newLink("link2");
        Terms memory t = _terms();
        t.claimSigner = link2;
        _submit(t, _signAuth(senderPk, t));
        bytes memory forged = _signCancel(strangerPk, link2, deadline);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.InvalidSignature.selector, sender));
        escrow.cancelWithSig(link2, deadline, forged);
    }

    // ---------------------------------------------------------------------
    // Refund
    // ---------------------------------------------------------------------

    function test_refund_beforeExpiryReverts() public {
        Terms memory t = _fund();
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NotExpired.selector, link, t.expiry));
        escrow.refund(link);

        vm.warp(t.expiry - 1);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NotExpired.selector, link, t.expiry));
        escrow.refund(link);
    }

    function test_refund_fromExpiryAnyoneSendsItHome() public {
        Terms memory t = _fund();
        vm.warp(t.expiry);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Returned(link, sender, AMOUNT, true);
        vm.prank(stranger);
        escrow.refund(link);
        assertEq(ausd.balanceOf(sender), 1_000e6);
        _assertGone(link);

        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.refund(link);
    }

    function test_refund_afterClaimReverts() public {
        Terms memory t = _fund();
        _claim(link, linkPk, recipient);
        vm.warp(t.expiry);
        vm.expectRevert(abi.encodeWithSelector(ClaimEscrow.NoDeposit.selector, link));
        escrow.refund(link);
    }

    /// The notes' frozen sender. The token will not pay the sender, so cancel and refund
    /// wait until it will; the link itself still pays whoever opens it before expiry.
    function test_refund_heldWhileSenderFrozen_claimStillWorks() public {
        FreezableToken token = new FreezableToken();
        (address link2,) = _newLink("second link");
        _depositAs(sender, token, 100e6, link);
        _depositAs(sender, token, 50e6, link2);
        uint64 expiry = escrow.depositOf(link2).expiry;
        token.freeze(sender, true);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(FreezableToken.AccountFrozen.selector, sender));
        escrow.cancel(link2);

        _claim(link, linkPk, recipient);
        assertEq(token.balanceOf(recipient), 100e6, "the link still pays out");

        vm.warp(expiry);
        vm.expectRevert(abi.encodeWithSelector(FreezableToken.AccountFrozen.selector, sender));
        escrow.refund(link2);
        assertEq(escrow.depositOf(link2).amount, 50e6, "held, not lost");

        token.freeze(sender, false);
        escrow.refund(link2);
        assertEq(token.balanceOf(sender), 50e6, "home once the token will pay");
        _assertGone(link2);
    }

    // ---------------------------------------------------------------------
    // Hostile and unusual tokens
    // ---------------------------------------------------------------------

    /// The token calls back into the escrow while paying out. The guard stops the inner
    /// call; the deposit is also already deleted by then, so even without the guard the
    /// inner claim would find nothing.
    function test_reentrancy_payoutCannotReenter() public {
        ReentrantToken token = new ReentrantToken();
        _depositAs(sender, token, 100e6, link);

        bytes memory sig = _signClaim(linkPk, link, recipient);
        token.arm(address(escrow), abi.encodeCall(ClaimEscrow.claim, (link, recipient, sig)));

        vm.prank(relayer);
        escrow.claim(link, recipient, sig);

        assertTrue(token.attempted(), "the token did try");
        assertFalse(token.reentered(), "the inner call failed");
        assertEq(bytes4(token.reentryRevert()), ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        assertEq(token.balanceOf(recipient), 100e6, "paid exactly once");
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertGone(link);
    }

    /// The token calls back while being deposited, trying to take another link's money.
    function test_reentrancy_depositCannotReenter() public {
        ReentrantToken token = new ReentrantToken();
        (address other, uint256 otherPk) = _newLink("other link");
        _depositAs(stranger, token, 70e6, other);

        bytes memory sig = _signClaim(otherPk, other, makeAddr("attacker"));
        token.arm(address(escrow), abi.encodeCall(ClaimEscrow.claim, (other, makeAddr("attacker"), sig)));
        _depositAs(sender, token, 100e6, link);

        assertTrue(token.attempted());
        assertFalse(token.reentered());
        assertEq(bytes4(token.reentryRevert()), ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        assertEq(escrow.depositOf(link).amount, 100e6, "the outer deposit recorded normally");
        assertEq(escrow.depositOf(other).amount, 70e6, "the other link untouched");
        assertEq(token.balanceOf(address(escrow)), 170e6);
    }

    /// What is recorded is what arrived, so the escrow never owes more than it holds.
    function test_feeOnTransfer_recordsWhatArrived() public {
        FeeOnTransferToken token = new FeeOnTransferToken();
        token.mint(sender, 100e6);
        bytes memory fundSig = _signFund(link, address(token), sender, 100e6, _expiry());
        vm.startPrank(sender);
        token.approve(address(escrow), 100e6);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Deposited(link, address(token), sender, 99e6, _expiry());
        uint256 received = escrow.deposit(address(token), 100e6, link, _expiry(), fundSig);
        vm.stopPrank();

        assertEq(received, 99e6, "net of the 1% fee");
        assertEq(escrow.depositOf(link).amount, 99e6);
        assertEq(token.balanceOf(address(escrow)), 99e6);

        _claim(link, linkPk, recipient);
        assertEq(token.balanceOf(address(escrow)), 0, "paid out exactly what it held");
        assertEq(token.balanceOf(recipient), 99e6 - 99e6 / 100, "the token's own fee on the way out");
    }

    /// A token that charges its fee on top is unsupported, as the notes say: each payout
    /// costs the escrow more than the deposit it pays, so the last deposit of that token
    /// comes up short. The shortfall stays with that token, and a top-up releases it.
    function test_feeOnTop_shortfallStaysWithThatToken() public {
        FeeOnTopToken top = new FeeOnTopToken();
        (address linkB, uint256 linkBPk) = _newLink("fee-on-top link B");
        (address linkC, uint256 linkCPk) = _newLink("AUSD link C");

        top.mint(sender, 1e6); // the fee, on top
        assertEq(_depositAs(sender, top, 100e6, link), 100e6, "arrives whole");
        top.mint(stranger, 1e6);
        _depositAs(stranger, top, 100e6, linkB);
        _depositAs(stranger, ausd, 40e6, linkC);
        assertEq(top.balanceOf(address(escrow)), 200e6);

        _claim(link, linkPk, recipient);
        assertEq(top.balanceOf(recipient), 100e6);
        assertEq(top.balanceOf(address(escrow)), 99e6, "the payout cost the escrow 101");

        bytes memory claimB = _signClaim(linkBPk, linkB, recipient);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(escrow), 98e6, 100e6)
        );
        escrow.claim(linkB, recipient, claimB);

        _claim(linkC, linkCPk, recipient);
        assertEq(ausd.balanceOf(recipient), 40e6, "another token's deposit is paid in full");

        top.mint(address(escrow), 2e6);
        escrow.claim(linkB, recipient, claimB);
        assertEq(top.balanceOf(recipient), 200e6, "the top-up released it");
        assertEq(top.balanceOf(address(escrow)), 0);
    }

    /// What the notes promise about `from`, and no more. With a real ERC-3009 token nobody
    /// can file a deposit "from" an account that did not sign. With a token written for
    /// the purpose they can, under a link of their own: the escrow records and announces
    /// the victim as the sender though nothing of theirs moved. `token` is what gives it
    /// away, and what anything showing a deposit must check before believing `from`.
    function test_depositWithAuthorization_fromIsOnlyAsGoodAsTheToken() public {
        (address own,) = _newLink("stranger's own link");
        (, uint256 strangerPk) = makeAddrAndKey("stranger key");
        Terms memory t = _terms();
        t.claimSigner = own;

        bytes memory forged = _signAuth(strangerPk, t);
        bytes memory fundSig = _signFund(own, address(ausd), sender, AMOUNT, t.expiry);
        vm.prank(stranger);
        vm.expectRevert(MockERC3009Token.InvalidSignature.selector);
        escrow.depositWithAuthorization(
            address(ausd), sender, AMOUNT, own, t.expiry, t.validBefore, t.salt, forged, fundSig
        );
        assertFalse(escrow.used(own), "AUSD-like tokens check the sender");

        UncheckedAuthorizationToken fake = new UncheckedAuthorizationToken();
        bytes memory fakeFundSig = _signFund(own, address(fake), sender, AMOUNT, t.expiry);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClaimEscrow.Deposited(own, address(fake), sender, AMOUNT, t.expiry);
        vm.prank(stranger);
        escrow.depositWithAuthorization(
            address(fake), sender, AMOUNT, own, t.expiry, t.validBefore, t.salt, "", fakeFundSig
        );

        ClaimEscrow.Deposit memory d = escrow.depositOf(own);
        assertEq(d.from, sender, "recorded as the sender's, who signed nothing");
        assertEq(d.token, address(fake), "the token is what gives it away");
        assertEq(ausd.balanceOf(sender), 1_000e6, "nothing of the sender's moved");
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    function testFuzz_fundThenClaim_conserves(uint128 amount, uint64 ttl, uint64 claimAfter) public {
        amount = uint128(bound(amount, 1, type(uint128).max));
        ttl = uint64(bound(ttl, 1, escrow.MAX_EXPIRY()));
        claimAfter = uint64(bound(claimAfter, 0, ttl - 1));

        MockERC20 token = new MockERC20("Fuzz", "FZ", 18);
        token.mint(sender, amount);
        uint64 expiry = uint64(block.timestamp) + ttl;
        bytes memory fundSig = _signFund(link, address(token), sender, amount, expiry);
        vm.startPrank(sender);
        token.approve(address(escrow), amount);
        escrow.deposit(address(token), amount, link, expiry, fundSig);
        vm.stopPrank();

        vm.warp(block.timestamp + claimAfter);
        _claim(link, linkPk, recipient);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }
}
