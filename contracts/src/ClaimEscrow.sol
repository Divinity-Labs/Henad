// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IERC3009} from "./interfaces/external/IERC3009.sol";

/// @title ClaimEscrow
/// @notice Pay someone who has no account yet, by link. The money waits here until whoever
///         opens the link names the account it should go to, or until it goes back to the
///         sender.
///
///         How a claim link works, plainly:
///           * The sender's app makes a fresh keypair for every link. Its address, the
///             `claimSigner`, is the deposit's id here, and the app signs the funding with
///             its key, so nobody else can open a deposit under it. The private key then
///             goes only into the link's fragment, the part after `#`, which a browser
///             never sends to any server, Henad's included.
///           * The person who opens the link makes an account, and the page uses the key
///             from the fragment to sign "pay this deposit to that account". Anyone may
///             submit that signature; in practice Henad's relayer does, and pays the gas.
///           * Until it is claimed or cancelled, a link is a bearer instrument. Whoever
///             holds the fragment can claim the money to any account they like, and nothing
///             here can tell the person it was meant for from someone it was forwarded or
///             leaked to. The sender can cancel at any time before expiry, and after expiry
///             anyone can send the money back to the sender.
///           * No owner, no admin, no fee, no pause, no upgrade path. Nobody, Henad
///             included, can move a deposit anywhere except to the account a link holder
///             names or back to the sender.
///
/// @dev Funding has the same two shapes as CorridorRouter. `depositWithAuthorization` takes
///      the sender's ERC-3009 `ReceiveWithAuthorization` and anyone may submit it, so a
///      sender with no MON still sends; `deposit` pulls from `msg.sender` after an approve.
///
///      Why the ERC-3009 nonce binds the terms. The token checks from, to, value, the time
///      bounds and the nonce, and knows nothing of the claimSigner or the expiry. If the
///      nonce were free, whoever relayed a valid authorization could file it under a
///      claimSigner of their own and claim the money themselves. So the nonce is derived
///      from every term: `depositNonce` = keccak256(abi.encode(this, chainid, token, from,
///      amount, claimSigner, expiry, salt)). A relayer that changes any of them changes the
///      nonce, the sender's signature stops recovering, and the token refuses it. It is
///      the same move as CorridorRouter's, where the nonce is the intent id. The escrow's
///      address and the chain id are in it because ERC-3009 nonces are one space per
///      (token, sender): nothing signed for this escrow can collide with an intent for the
///      router or with another deployment of this contract. `salt` lets a sender sign the
///      same terms again under a new nonce after cancelling an authorization at the token.
///
///      Why the claim signature names the recipient. A claim transaction is public while it
///      waits to be included. If the signature covered only the deposit, anyone who saw it
///      could resubmit it with their own address. `Claim(claimSigner, recipient)` pins the
///      account: a different recipient needs a new signature, which needs the fragment's
///      key. Someone who copies the transaction as it stands only pays the gas for it. The
///      claimSigner is a key the app generated, so it is an EOA by construction and the
///      claim is checked with plain ECDSA. A contract address used as a claimSigner could
///      never claim; its deposit simply returns to the sender at expiry.
///
///      Why funding takes the link's key too. A claimSigner is public once its funding
///      transaction is in flight. If anyone could fund under any claimSigner, a watcher
///      could get in first with a deposit of their own under it, of one base unit or of a
///      token they wrote, and cancel it again at once; the sender's transaction would
///      revert `ClaimSignerUsed`, and since the ERC-3009 nonce covers the claimSigner,
///      every retry would need a new link and a new signature from the sender, which the
///      same watcher could block again for the price of gas. So both funding paths also
///      take a signature by the link's key over
///        Fund(address claimSigner,address token,address from,uint256 amount,uint64 expiry)
///      which only the sender's app can make. It names `from`, so a watcher's own
///      `deposit`, where `from` is the watcher, cannot use it; it names the token, so it
///      cannot open a deposit in another one; and resubmitting the sender's transaction
///      as it stands only funds the sender's deposit. Like the claim, it is plain ECDSA.
///
///      One deposit per claimSigner, ever. A claimSigner is marked used the moment it funds
///      a deposit and stays marked after the deposit is claimed, cancelled or returned. The
///      fund, claim and cancel signatures carry no nonce and are single-use because the
///      claimSigner is: were reuse allowed, the first claim signature, public in calldata
///      for good, would replay against the second deposit and pay it to the first
///      recipient, and an old leaked link would open the new money too.
///
///      What is recorded is what arrived: the escrow's own balance delta across the pull,
///      never the amount asked for. A token that takes its fee out of the amount sent
///      therefore records the net. The payout sends exactly the recorded amount and
///      assumes the escrow's balance falls by exactly that much; a token that takes a fee
///      out of the amount on the way out delivers less than that, which is the token's
///      doing. Two kinds of token break the assumption and are not supported, though
///      nothing here refuses them: one whose transfer takes more than the amount from the
///      sender's balance (a fee charged on top), and one whose balances move without a
///      transfer (rebasing). Either can leave the escrow owing more of that token than it
///      holds, so the last deposits of it cannot be paid out until someone tops the
///      escrow's balance of it back up. There is no sweep, so a surplus stays put. AUSD and
///      USDC take no fee and do not rebase. A deposit only ever pays out in its own token,
///      so a hostile token contract can at worst misbehave with deposits of itself, and no
///      other token's money moves.
///
///      A deposit's `from` and `amount` are only as trustworthy as its token. Through
///      `deposit` the sender is msg.sender and needs nobody's word. Through
///      `depositWithAuthorization` the escrow never checks the sender's signature itself;
///      it relies on the token to, and the caller names the token. AUSD and USDC check it
///      over a nonce that covers `from`, but a token written for the purpose can skip the
///      check and raise the escrow's balance anyway, and the escrow will then record, and
///      announce in `Deposited` and later `Returned`, a deposit "from" an account that
///      never signed anything. No real money moves and no other token's deposits are
///      touched, but anything that shows a deposit, its sender or its amount (a claim
///      page, a list of links sent, a relayer deciding whether to pay the gas to settle
///      one) must check its `token` against the tokens it expects first.
///
///      Time: claim and cancel work while `block.timestamp < expiry`; refund works from
///      `expiry` on. The windows do not overlap, so a claim and a refund cannot race in the
///      same second. A token that refuses to pay the sender (an account frozen by its
///      issuer) holds a refund until it will; before expiry the link can still be claimed.
///
///      Cancel by signature verifies ECDSA against the sender's key first and ERC-1271
///      second, in HandleRegistry's order and for its reason: a sender may be a smart
///      account, or an EIP-7702 delegated EOA whose delegate has no `isValidSignature`.
///
///      Reentrancy: every state-changing entry point is `nonReentrant` (transient storage,
///      live on Monad per docs/INTEGRATION-FACTS.md §14.5), and payouts are also
///      checks-effects-interactions: the deposit is deleted before the token is called.
contract ClaimEscrow is EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice One deposit waiting behind one link. `from` is never zero for a live
    ///         deposit, so a zero `from` means there is none.
    struct Deposit {
        address token;
        address from; // the sender, who can cancel and who receives a refund; only as good as `token`
        uint128 amount; // base units that actually arrived
        uint64 expiry; // unix seconds; claimable strictly before, refundable from
    }

    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(address claimSigner,address recipient)");
    bytes32 public constant CANCEL_TYPEHASH = keccak256("Cancel(address claimSigner,uint256 deadline)");
    bytes32 public constant FUND_TYPEHASH =
        keccak256("Fund(address claimSigner,address token,address from,uint256 amount,uint64 expiry)");

    /// @notice The longest a link may stay open. Long enough for someone to get round to
    ///         opening a link sent by message; short enough that forgotten money comes home.
    uint64 public constant MAX_EXPIRY = 90 days;

    mapping(address claimSigner => Deposit) private _deposits;

    /// @notice Whether `claimSigner` has ever funded a deposit. Set on deposit, never cleared.
    mapping(address claimSigner => bool) public used;

    event Deposited(
        address indexed claimSigner, address indexed token, address indexed from, uint256 amount, uint64 expiry
    );
    event Claimed(address indexed claimSigner, address indexed recipient, uint256 amount);
    /// @notice The deposit went back to its sender: by cancel (`expired` false) or by
    ///         refund after expiry (`expired` true).
    event Returned(address indexed claimSigner, address indexed to, uint256 amount, bool expired);

    error ZeroAddress();
    error ZeroAmount();
    error ValueOverflow();
    error InvalidExpiry(uint64 expiry);
    error ClaimSignerUsed(address claimSigner);
    error AuthorizationUsed(bytes32 nonce);
    error NoDeposit(address claimSigner);
    error DepositExpired(address claimSigner, uint64 expiry);
    error NotExpired(address claimSigner, uint64 expiry);
    error NotDepositor(address caller, address from);
    error InvalidRecipient(address recipient);
    error InvalidSignature(address signer);
    error SignatureExpired(uint256 deadline);

    constructor() EIP712("Henad Claims", "1") {}

    // ---------------------------------------------------------------------
    // Fund
    // ---------------------------------------------------------------------

    /// @notice Fund a link from the sender's ERC-3009 authorization. Anyone may submit it.
    /// @dev The authorization must name this contract as `to`, `amount` as value,
    ///      `validAfter = 0`, `validBefore` as given and
    ///      `nonce = depositNonce(token, from, amount, claimSigner, expiry, salt)`. Reverts
    ///      `AuthorizationUsed` before touching the token when that nonce is already spent
    ///      or cancelled there, so a relayer pre-flight gets this contract's error rather
    ///      than the token's.
    /// @param token         An ERC-3009 token (AUSD, USDC). Whoever calls picks it, and
    ///                      `from` is only as trustworthy as it is; see the contract notes.
    /// @param from          The sender, whose authorization the token checks.
    /// @param amount        Base units authorized. What is recorded is what arrives.
    /// @param claimSigner   The link's public half. Nonzero and never used before.
    /// @param expiry        Unix seconds, after now and at most MAX_EXPIRY from now.
    /// @param validBefore   The authorization's own deadline, as signed.
    /// @param salt          Any value; part of the nonce.
    /// @param signature     65-byte ECDSA (or whatever the token accepts for `from`) over the
    ///                      ERC-3009 digest, passed through to the token untouched.
    /// @param fundSignature 65-byte ECDSA by the link's key over
    ///                      Fund(claimSigner, token, from, amount, expiry).
    /// @return received     Base units recorded for the link.
    function depositWithAuthorization(
        address token,
        address from,
        uint256 amount,
        address claimSigner,
        uint64 expiry,
        uint256 validBefore,
        bytes32 salt,
        bytes calldata signature,
        bytes calldata fundSignature
    ) external nonReentrant returns (uint256 received) {
        if (from == address(0)) revert ZeroAddress();
        _requireFundable(token, from, amount, claimSigner, expiry, fundSignature);

        bytes32 nonce = depositNonce(token, from, amount, claimSigner, expiry, salt);
        if (IERC3009(token).authorizationState(from, nonce)) revert AuthorizationUsed(nonce);

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC3009(token).receiveWithAuthorization(from, address(this), amount, 0, validBefore, nonce, signature);
        received = _record(token, from, claimSigner, expiry, before);
    }

    /// @notice Fund a link from the caller's own balance. The caller must have approved
    ///         `amount` to this contract, and becomes the deposit's sender.
    /// @param token         An ERC-20 that moves exactly the amount a transfer names out of
    ///                      the sender's balance and does not rebase; see the contract notes.
    /// @param amount        Base units to pull. What is recorded is what arrives.
    /// @param claimSigner   The link's public half. Nonzero and never used before.
    /// @param expiry        Unix seconds, after now and at most MAX_EXPIRY from now.
    /// @param fundSignature 65-byte ECDSA by the link's key over
    ///                      Fund(claimSigner, token, msg.sender, amount, expiry).
    /// @return received     Base units recorded for the link.
    function deposit(address token, uint256 amount, address claimSigner, uint64 expiry, bytes calldata fundSignature)
        external
        nonReentrant
        returns (uint256 received)
    {
        _requireFundable(token, msg.sender, amount, claimSigner, expiry, fundSignature);

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        received = _record(token, msg.sender, claimSigner, expiry, before);
    }

    // ---------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------

    /// @notice Pay a link's deposit to `recipient`. Anyone may submit; the signature is what
    ///         authorises it.
    /// @param claimSigner The link's public half.
    /// @param recipient   The account to pay. Not zero and not this contract.
    /// @param signature   65-byte ECDSA by the link's key over Claim(claimSigner, recipient).
    function claim(address claimSigner, address recipient, bytes calldata signature) external nonReentrant {
        Deposit memory d = _live(claimSigner);
        if (block.timestamp >= d.expiry) revert DepositExpired(claimSigner, d.expiry);
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient(recipient);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, claimSigner, recipient)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != claimSigner) revert InvalidSignature(claimSigner);

        delete _deposits[claimSigner];
        emit Claimed(claimSigner, recipient, d.amount);
        IERC20(d.token).safeTransfer(recipient, d.amount);
    }

    // ---------------------------------------------------------------------
    // Return to sender
    // ---------------------------------------------------------------------

    /// @notice The sender takes a deposit back before its link expires.
    function cancel(address claimSigner) external nonReentrant {
        Deposit memory d = _live(claimSigner);
        if (msg.sender != d.from) revert NotDepositor(msg.sender, d.from);
        if (block.timestamp >= d.expiry) revert DepositExpired(claimSigner, d.expiry);
        _return(claimSigner, d, false);
    }

    /// @notice `cancel` on the strength of the sender's signature, so a sender with no MON
    ///         can take a deposit back. Anyone may submit it; the money only ever goes to
    ///         the sender.
    /// @dev No nonce: the signature names one claimSigner, and a claimSigner's deposit ends
    ///      once, so the signature cannot act twice.
    /// @param deadline  Unix seconds. Accepted up to and including this second.
    /// @param signature ECDSA or ERC-1271 by the sender over Cancel(claimSigner, deadline).
    function cancelWithSig(address claimSigner, uint256 deadline, bytes calldata signature) external nonReentrant {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        Deposit memory d = _live(claimSigner);
        if (block.timestamp >= d.expiry) revert DepositExpired(claimSigner, d.expiry);
        _requireSignature(d.from, keccak256(abi.encode(CANCEL_TYPEHASH, claimSigner, deadline)), signature);
        _return(claimSigner, d, false);
    }

    /// @notice Send an expired deposit back to its sender. Anyone may call it, so money
    ///         left behind a forgotten link comes home without the sender doing anything.
    function refund(address claimSigner) external nonReentrant {
        Deposit memory d = _live(claimSigner);
        if (block.timestamp < d.expiry) revert NotExpired(claimSigner, d.expiry);
        _return(claimSigner, d, true);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The live deposit behind `claimSigner`, or all zeros if there is none, either
    ///         because there never was or because it has ended; `used` tells the two apart.
    function depositOf(address claimSigner) external view returns (Deposit memory) {
        return _deposits[claimSigner];
    }

    /// @notice The ERC-3009 nonce the sender must sign for `depositWithAuthorization`.
    function depositNonce(address token, address from, uint256 amount, address claimSigner, uint64 expiry, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), block.chainid, token, from, amount, claimSigner, expiry, salt));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev The Fund signature is checked last, so a relayer pre-flight on a link that is
    ///      already taken gets `ClaimSignerUsed`, not a signature error. The contract notes
    ///      say why it is needed at all.
    function _requireFundable(
        address token,
        address from,
        uint256 amount,
        address claimSigner,
        uint64 expiry,
        bytes calldata fundSignature
    ) private view {
        if (token == address(0) || claimSigner == address(0)) revert ZeroAddress();
        if (used[claimSigner]) revert ClaimSignerUsed(claimSigner);
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_EXPIRY) revert InvalidExpiry(expiry);

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(FUND_TYPEHASH, claimSigner, token, from, amount, expiry)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, fundSignature);
        if (err != ECDSA.RecoverError.NoError || recovered != claimSigner) revert InvalidSignature(claimSigner);
    }

    /// @dev Runs after the pull, under the guard, so the delta can only be this deposit's.
    function _record(address token, address from, address claimSigner, uint64 expiry, uint256 before)
        private
        returns (uint256 received)
    {
        received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        if (received > type(uint128).max) revert ValueOverflow();

        used[claimSigner] = true;
        _deposits[claimSigner] = Deposit({token: token, from: from, amount: uint128(received), expiry: expiry});
        emit Deposited(claimSigner, token, from, received, expiry);
    }

    function _live(address claimSigner) private view returns (Deposit memory d) {
        d = _deposits[claimSigner];
        if (d.from == address(0)) revert NoDeposit(claimSigner);
    }

    function _return(address claimSigner, Deposit memory d, bool expired) private {
        delete _deposits[claimSigner];
        emit Returned(claimSigner, d.from, d.amount, expired);
        IERC20(d.token).safeTransfer(d.from, d.amount);
    }

    /// @dev ECDSA first, then ERC-1271; the contract notes give the reason for the order.
    function _requireSignature(address signer, bytes32 structHash, bytes calldata signature) private view {
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return;
        if (SignatureChecker.isValidERC1271SignatureNowCalldata(signer, digest, signature)) return;
        revert InvalidSignature(signer);
    }
}
