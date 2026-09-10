// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IRateAttestation
/// @notice The receipt. One immutable record per settled payout: the reference rate
///         the sender was shown, the rate they actually got, and the spread between
///         them, with the rate's source named on-chain.
/// @dev No admin key may alter a stored attestation. Only the registered router may
///      write. This event shape is the reference implementation for the MRC draft
///      in docs/MRC-DRAFT.md; changes here must be mirrored there.
interface IRateAttestation {
    struct Attestation {
        bytes32 corridor;        // keccak256("USD/GBP")
        uint256 referenceRate;   // from IRateSource, scaled 1e18
        uint256 executedRate;    // deliveredAmount / sourceAmount, normalised to 1e18
        int256 spreadBps;        // (reference - executed) / reference * 1e4; negative = better than reference
        uint256 sourceAmount;    // in source asset base units
        uint256 deliveredAmount; // in target asset base units
        address rateSource;      // the oracle address the reference was read from
        address venue;           // the IVenueAdapter that executed
        uint64 settledAt;
    }

    /// @notice Emitted once per settlement, in the same transaction as the swap.
    event PayoutSettled(
        bytes32 indexed intentId,
        bytes32 indexed corridor,
        uint256 referenceRate,
        uint256 executedRate,
        int256 spreadBps,
        uint256 sourceAmount,
        uint256 deliveredAmount,
        address rateSource,
        address venue,
        uint64 settledAt
    );

    error AlreadyAttested(bytes32 intentId);
    error NotRouter(address caller);

    /// @notice Record a settlement. Reverts if `intentId` already has one.
    function attest(bytes32 intentId, Attestation calldata a) external;

    /// @notice Read a stored receipt. `settledAt == 0` means none exists.
    function get(bytes32 intentId) external view returns (Attestation memory);
}
