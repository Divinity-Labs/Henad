// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IRateAttestation} from "./interfaces/IRateAttestation.sol";

/// @title RateAttestation
/// @notice Append-only receipt store. See IRateAttestation for the shape and the
///         reasons behind it. There is no owner, no upgrade path, and no function
///         that modifies an existing record.
contract RateAttestation is IRateAttestation {
    /// @inheritdoc IRateAttestation
    address public immutable router;

    /// @inheritdoc IRateAttestation
    uint256 public count;

    mapping(bytes32 intentId => Attestation) private _receipts;

    error ZeroAddress();

    /// @param router_ The CorridorRouter. Predicted with CREATE address math at
    ///                deploy time so neither contract needs a setter.
    constructor(address router_) {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
    }

    /// @inheritdoc IRateAttestation
    function attest(
        bytes32 intentId,
        Attestation calldata a,
        address payer,
        address recipient,
        address sourceAsset,
        address targetAsset
    ) external {
        if (msg.sender != router) revert NotRouter(msg.sender);
        if (_receipts[intentId].settledAt != 0) revert AlreadyAttested(intentId);
        if (a.settledAt == 0) revert ValueOverflow(); // a zero timestamp would read as "no receipt"

        _receipts[intentId] = a;
        unchecked {
            ++count;
        }

        emit PayoutSettled(intentId, a.corridor, payer, recipient, sourceAsset, targetAsset, a);
    }

    /// @inheritdoc IRateAttestation
    function get(bytes32 intentId) external view returns (Attestation memory) {
        return _receipts[intentId];
    }
}
