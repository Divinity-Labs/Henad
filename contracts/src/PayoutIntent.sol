// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title PayoutIntent
/// @notice Intent hashing and lifecycle registry, inherited by CorridorRouter.
/// @dev An intent is a signed, off-chain object; it never exists "Open" on-chain.
///      Its EIP-712 hash is the `intentId`, and in the relayer path that same hash
///      is the ERC-3009 nonce, so the payer's single token authorization binds
///      every intent field (docs/INTEGRATION-FACTS.md §14.4). The domain includes
///      chainId and the router address, so an intentId is unique per chain and
///      per deployment. Lifecycle: None -> Filled | Cancelled. Expiry is a
///      property of `deadline`, not a stored state.
abstract contract PayoutIntent is EIP712 {
    /// @notice What the payer signs. Field order is the EIP-712 encoding order.
    struct Intent {
        address payer; // whose funds move; must be msg.sender (path B) or the ERC-3009 authorizer (path A)
        address recipient; // receives the target asset directly from the venue
        address sourceAsset; // e.g. AUSD
        address targetAsset; // e.g. GBPm
        uint256 sourceAmount; // base units of sourceAsset
        uint256 quotedAmountOut; // venue quote shown to the payer, base units of targetAsset
        uint16 toleranceBps; // slippage vs the venue quote; minAmountOut = quotedAmountOut * (1 - tol)
        uint16 maxSpreadBps; // disclosure limit vs the reference rate; reverts if exceeded
        uint64 deadline; // unix seconds; also the ERC-3009 validBefore in path A
        bytes32 salt; // client randomness so identical intents get distinct ids
    }

    enum Status {
        None,
        Filled,
        Cancelled
    }

    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address payer,address recipient,address sourceAsset,address targetAsset,uint256 sourceAmount,uint256 quotedAmountOut,uint16 toleranceBps,uint16 maxSpreadBps,uint64 deadline,bytes32 salt)"
    );
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 intentId => Status) private _status;

    event IntentCancelled(bytes32 indexed intentId, address indexed payer);

    error IntentNotOpen(bytes32 intentId, Status status);
    error IntentExpired(bytes32 intentId, uint64 deadline);
    error NotPayer(address caller, address payer);
    error InvalidIntent(string reason);

    constructor() EIP712("Henad", "1") {}

    /// @notice EIP-712 typed-data hash of an intent under this contract's domain.
    function hashIntent(Intent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    INTENT_TYPEHASH,
                    intent.payer,
                    intent.recipient,
                    intent.sourceAsset,
                    intent.targetAsset,
                    intent.sourceAmount,
                    intent.quotedAmountOut,
                    intent.toleranceBps,
                    intent.maxSpreadBps,
                    intent.deadline,
                    intent.salt
                )
            )
        );
    }

    /// @notice Lifecycle state of an intent id.
    function intentStatus(bytes32 intentId) public view returns (Status) {
        return _status[intentId];
    }

    /// @notice The least the venue may deliver: the signed quote minus the signed tolerance.
    /// @dev Derived from the venue quote only, never from the reference rate
    ///      (docs/INTEGRATION-FACTS.md §14.3).
    function minAmountOut(Intent calldata intent) public pure returns (uint256) {
        return intent.quotedAmountOut * (BPS_DENOMINATOR - intent.toleranceBps) / BPS_DENOMINATOR;
    }

    /// @notice Payer voids an unsettled intent. Path-A payers without gas cancel at
    ///         the token instead (`cancelAuthorization` with nonce = intentId).
    function cancel(Intent calldata intent) external {
        if (msg.sender != intent.payer) revert NotPayer(msg.sender, intent.payer);
        bytes32 intentId = hashIntent(intent);
        Status s = _status[intentId];
        if (s != Status.None) revert IntentNotOpen(intentId, s);
        _status[intentId] = Status.Cancelled;
        emit IntentCancelled(intentId, intent.payer);
    }

    /// @dev Structural and lifecycle checks shared by both settlement paths.
    function _requireOpen(Intent calldata intent, bytes32 intentId) internal view {
        Status s = _status[intentId];
        if (s != Status.None) revert IntentNotOpen(intentId, s);
        if (block.timestamp > intent.deadline) revert IntentExpired(intentId, intent.deadline);
        if (intent.payer == address(0)) revert InvalidIntent("payer");
        if (intent.recipient == address(0)) revert InvalidIntent("recipient");
        if (intent.sourceAmount == 0) revert InvalidIntent("sourceAmount");
        if (intent.quotedAmountOut == 0) revert InvalidIntent("quotedAmountOut");
        if (intent.toleranceBps >= BPS_DENOMINATOR) revert InvalidIntent("toleranceBps");
        if (intent.sourceAsset == intent.targetAsset) revert InvalidIntent("sameAsset");
    }

    function _markFilled(bytes32 intentId) internal {
        _status[intentId] = Status.Filled;
    }
}
