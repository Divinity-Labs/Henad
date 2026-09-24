// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title HandleRegistry
/// @notice Henad usernames. A person picks a handle such as `ada` at signup, and a payer
///         can then send to that name instead of an address. One handle per address, one
///         address per handle. The at-sign the app shows in front is display only and is
///         never stored.
///
///         What a handle is, plainly:
///           * First come, first served. Whoever registers a free handle first holds it
///             until they release it or register a different one.
///           * No reserved names. Nothing is held back: not "henad", not "support", not
///             anyone's real name or brand. A handle is what its holder chose to call
///             themselves, not an identity anyone checked, so the app still treats a
///             first payment to someone new as a payment to someone new.
///           * Public, and permanent in history. Registering writes the handle and the
///             address to chain state and to an event log that every node keeps.
///             Releasing or changing a handle frees the name for others, but the record
///             that this address once held it stays readable forever. It cannot be deleted.
///           * No owner, no admin, no fees, no pause, no upgrade path. Nobody, Henad
///             included, can take a handle from its holder, reassign it, charge for it or
///             switch the registry off.
///
/// @dev Each action has a direct form, where the holder is msg.sender (`register`,
///      `release`, `cancel`), and a signed form that anyone may submit (`registerFor`,
///      `releaseFor`, `cancelFor`), so Henad's relayer can pay the gas for a user who holds
///      no MON. The signed forms verify EIP-712 typed data under the domain
///      ("Henad Handles", "1", chainId, this):
///        Register(address owner,string handle,uint256 nonce,uint256 deadline)
///        Release(address owner,uint256 nonce,uint256 deadline)
///        Cancel(address owner,uint256 nonce,uint256 deadline)
///
///      Nonces: one per owner, and every action that lands spends it, direct or signed.
///      Only the owner's own actions change the owner's handle, so a nonce names one state
///      of it, and a signature can only ever act on the handle its owner held when they
///      signed. That is why neither type needs to name the handle being given up: whatever
///      the owner does next, including a direct `register` or `release`, kills every
///      signature made before it. Were the direct forms to leave the nonce alone, an old
///      Register or Release still waiting at a relayer could land after the owner had
///      moved on, free a handle the owner took later and never agreed to give up, and let
///      whoever submitted it register that handle in the same transaction. For the same
///      reason a signed call that reverts is harmless: the only state it can ever meet is
///      the one it already failed against. The one exception, a handle someone else holds
///      coming free again, is handled below. Otherwise an unused signature stays live
///      until its deadline; `cancel` and `cancelFor` spend the nonce and do nothing else,
///      and clients should keep deadlines short.
///
///      Signature order: ECDSA against the owner's own key first, then ERC-1271 through
///      OpenZeppelin's SignatureChecker. The order matters for Henad's users. An EIP-7702
///      delegated EOA has code, and SignatureChecker on its own would send it to ERC-1271
///      only, so a delegate without `isValidSignature` would lock the owner's own key out.
///      The key behind a delegated EOA can always re-delegate, so its signature is
///      authoritative; a contract with no key can never produce a matching ECDSA
///      signature, so trying ECDSA first grants nothing extra. AUSD verifies ERC-3009
///      signatures in the same order (docs/INTEGRATION-FACTS.md §14.4).
///
///      Front-running: a `registerFor` transaction names its handle in the clear before it
///      is included. Anyone who sees it can register the same handle first from their own
///      address. The signed call then still spends the signer's nonce, changes nothing
///      else, emits `HandleUnavailable` and returns false; it does not revert. A revert
///      would undo the spend and leave the signature live until its deadline, public in
///      the failed transaction's calldata. The front-runner could then let the name go and
///      replay the signature whenever they liked, after the signer's app had told them the
///      change failed, and in the same transaction take the handle the signer was still
///      giving out, since the switch frees it. As it is, the signature dies with the
///      failed attempt, the signer's current handle stays theirs, and the front-runner
///      gains one unclaimed name they could have taken anyway. This contract holds no
///      funds. Anyone may also submit a signature on the owner's behalf, which only does
///      what the owner signed.
contract HandleRegistry is EIP712, Nonces {
    bytes32 public constant REGISTER_TYPEHASH =
        keccak256("Register(address owner,string handle,uint256 nonce,uint256 deadline)");
    bytes32 public constant RELEASE_TYPEHASH = keccak256("Release(address owner,uint256 nonce,uint256 deadline)");
    bytes32 public constant CANCEL_TYPEHASH = keccak256("Cancel(address owner,uint256 nonce,uint256 deadline)");

    /// @notice Handle length bounds in bytes, which is also characters since every
    ///         allowed character is one byte.
    uint256 public constant MIN_LENGTH = 3;
    uint256 public constant MAX_LENGTH = 20;

    mapping(string handle => address owner) private _owners;
    mapping(address owner => string handle) private _handles;

    /// @notice `handle` now points at `owner`. Not indexed, so the text itself is in the
    ///         log; an indexed string keeps only its hash.
    event HandleRegistered(address indexed owner, string handle);

    /// @notice `handle` no longer points at `owner` and is free for anyone. Emitted by
    ///         `release`, and before `HandleRegistered` when an owner switches handles.
    event HandleReleased(address indexed owner, string handle);

    /// @notice A signed registration landed but `handle` was already held, by someone else
    ///         or by `owner`. Nothing changed except `owner`'s nonce, so that signature and
    ///         every other one `owner` made against the same nonce are spent.
    event HandleUnavailable(address indexed owner, string handle);

    /// @notice `owner` spent `nonce` without touching their handle. Every signature they
    ///         made against it is dead.
    event NonceCancelled(address indexed owner, uint256 nonce);

    error InvalidHandle(string handle);
    error HandleTaken(string handle);
    error NoHandle(address owner);
    error SignatureExpired(uint256 deadline);
    error InvalidSignature(address owner);

    constructor() EIP712("Henad Handles", "1") {}

    // ---------------------------------------------------------------------
    // Register
    // ---------------------------------------------------------------------

    /// @notice Claim `handle` for the caller. The caller's current handle, if any, is
    ///         released in the same call.
    /// @dev Reverts `HandleTaken` for any held handle, the caller's own included, so a
    ///      retried registration fails loudly instead of logging a release and a
    ///      re-registration of the same name. Spends the caller's nonce; see the contract
    ///      notes.
    /// @param handle Must match ^[a-z0-9_]{3,20}$ and be free.
    function register(string calldata handle) external {
        _requireShape(handle);
        if (_owners[handle] != address(0)) revert HandleTaken(handle);
        _useNonce(msg.sender);
        _register(msg.sender, handle);
    }

    /// @notice Claim `handle` for `owner` on the strength of `owner`'s signature. Anyone
    ///         may submit it; in practice Henad's relayer, which pays the gas.
    /// @dev See the contract notes on nonces, signature order and front-running. A handle
    ///      that is already held does not revert: the signature is spent, nothing else
    ///      changes, `HandleUnavailable` is emitted and the call returns false, which a
    ///      client reads as "taken". A malformed handle reverts before the signature is
    ///      checked; it can never become valid, so there is nothing to replay.
    /// @param owner      The address the handle will point at, and the signer.
    /// @param handle     Must match ^[a-z0-9_]{3,20}$.
    /// @param deadline   Unix seconds. Accepted up to and including this second.
    /// @param signature  ECDSA or ERC-1271 over Register(owner, handle, nonces(owner), deadline).
    /// @return registered True if `owner` now holds `handle`; false if it was already held.
    function registerFor(address owner, string calldata handle, uint256 deadline, bytes calldata signature)
        external
        returns (bool registered)
    {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        _requireShape(handle);
        _requireSignature(
            owner,
            keccak256(abi.encode(REGISTER_TYPEHASH, owner, keccak256(bytes(handle)), _useNonce(owner), deadline)),
            signature
        );
        if (_owners[handle] != address(0)) {
            emit HandleUnavailable(owner, handle);
            return false;
        }
        _register(owner, handle);
        return true;
    }

    // ---------------------------------------------------------------------
    // Release
    // ---------------------------------------------------------------------

    /// @notice Give up the caller's handle. It becomes free for anyone at once; the
    ///         history of who held it does not go away.
    /// @dev Spends the caller's nonce; see the contract notes.
    function release() external {
        _useNonce(msg.sender);
        _release(msg.sender);
    }

    /// @notice `release` on the strength of `owner`'s signature. Anyone may submit it.
    /// @param owner     The current holder, and the signer.
    /// @param deadline  Unix seconds. Accepted up to and including this second.
    /// @param signature ECDSA or ERC-1271 over Release(owner, nonces(owner), deadline).
    function releaseFor(address owner, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        _requireSignature(owner, keccak256(abi.encode(RELEASE_TYPEHASH, owner, _useNonce(owner), deadline)), signature);
        _release(owner);
    }

    // ---------------------------------------------------------------------
    // Cancel
    // ---------------------------------------------------------------------

    /// @notice Kill every signature the caller has made so far, and change nothing else.
    function cancel() external {
        emit NonceCancelled(msg.sender, _useNonce(msg.sender));
    }

    /// @notice `cancel` on the strength of `owner`'s signature, so an owner with no MON can
    ///         kill a signature still waiting somewhere without giving up their handle.
    ///         Anyone may submit it.
    /// @param owner     The signer.
    /// @param deadline  Unix seconds. Accepted up to and including this second.
    /// @param signature ECDSA or ERC-1271 over Cancel(owner, nonces(owner), deadline).
    function cancelFor(address owner, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        uint256 nonce = _useNonce(owner);
        _requireSignature(owner, keccak256(abi.encode(CANCEL_TYPEHASH, owner, nonce, deadline)), signature);
        emit NonceCancelled(owner, nonce);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The address holding `handle`, or zero if nobody does. Exact match only:
    ///         `ownerOf("Ada")` is always zero because "Ada" can never be registered, so a
    ///         client lowercases what the person typed before asking.
    function ownerOf(string calldata handle) external view returns (address) {
        return _owners[handle];
    }

    /// @notice The handle `owner` holds, or "" if none.
    function handleOf(address owner) external view returns (string memory) {
        return _handles[owner];
    }

    /// @notice Whether `handle` has the allowed shape, ^[a-z0-9_]{3,20}$. Says nothing
    ///         about whether it is free; see `ownerOf`.
    /// @dev Lowercase only, so "Ada" and "ada" cannot be two different people. ASCII only,
    ///      so a lookalike from another script (Cyrillic "а" for Latin "a") cannot pose as
    ///      someone else's handle. Any byte of a multi-byte UTF-8 character is >= 0x80 and
    ///      fails here.
    function isValidHandle(string memory handle) public pure returns (bool) {
        bytes memory b = bytes(handle);
        if (b.length < MIN_LENGTH || b.length > MAX_LENGTH) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_")) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _requireShape(string calldata handle) private pure {
        if (!isValidHandle(handle)) revert InvalidHandle(handle);
    }

    /// @dev Effects only: every caller has already checked the shape and that `handle` is
    ///      free, and has spent `owner`'s nonce.
    function _register(address owner, string calldata handle) private {
        string memory previous = _handles[owner];
        if (bytes(previous).length != 0) {
            delete _owners[previous];
            emit HandleReleased(owner, previous);
        }

        _owners[handle] = owner;
        _handles[owner] = handle;
        emit HandleRegistered(owner, handle);
    }

    function _release(address owner) private {
        string memory handle = _handles[owner];
        if (bytes(handle).length == 0) revert NoHandle(owner);

        delete _owners[handle];
        delete _handles[owner];
        emit HandleReleased(owner, handle);
    }

    /// @dev ECDSA first, then ERC-1271; the contract notes give the reason for the order.
    ///      A zero `owner` cannot pass: `tryRecover` never reports success for address
    ///      zero, and a call to an address with no code returns no magic value.
    function _requireSignature(address owner, bytes32 structHash, bytes calldata signature) private view {
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == owner) return;
        if (SignatureChecker.isValidERC1271SignatureNowCalldata(owner, digest, signature)) return;
        revert InvalidSignature(owner);
    }
}
