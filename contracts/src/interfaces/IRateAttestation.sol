// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IRateAttestation
/// @notice The receipt. One immutable record per settled payout: the reference
///         rate the sender was shown, the rate they actually got, the spread
///         between them, and enough provenance to replay the reference read.
/// @dev No admin key exists; only the router fixed at construction may write,
///      and a written record can never change. The struct is packed into six
///      storage slots because Monad prices storage per 128-slot page
///      (docs/INTEGRATION-FACTS.md §14.5). Payer, recipient and assets are in the
///      event only; `settledAtBlock` lets a reader fetch that event with a
///      single-block log query. This shape is the reference implementation for
///      docs/MRC-DRAFT.md; changes here must be mirrored there.
interface IRateAttestation {
    struct Attestation {
        bytes32 corridor; // slot 0: keccak256("USD/GBP")
        bytes32 referenceObservation; // slot 1: rate-source provenance (Chainlink: roundIds)
        uint128 referenceRate; // slot 2: 1e18, from IRateSource in the same tx
        uint128 executedRate; //         1e18, deliveredAmount / sourceAmount normalised
        uint128 sourceAmount; // slot 3: source asset base units
        uint128 deliveredAmount; //       target asset base units, recipient balance delta
        address rateSource; // slot 4: the IRateSource contract
        int32 spreadBps; //         (reference - executed) / reference * 1e4; negative = better
        uint64 settledAt; //        block.timestamp
        address venue; // slot 5: the IVenueAdapter that executed
        uint64 settledAtBlock; //   block.number
    }

    /// @notice Emitted once per settlement, in the same transaction as the swap.
    ///         `a` is the exact struct written to storage.
    event PayoutSettled(
        bytes32 indexed intentId,
        bytes32 indexed corridor,
        address indexed payer,
        address recipient,
        address sourceAsset,
        address targetAsset,
        Attestation a
    );

    error AlreadyAttested(bytes32 intentId);
    error NotRouter(address caller);
    error ValueOverflow();

    /// @notice The only address allowed to write. Fixed at construction.
    function router() external view returns (address);

    /// @notice Record a settlement. Reverts if `intentId` already has one.
    function attest(
        bytes32 intentId,
        Attestation calldata a,
        address payer,
        address recipient,
        address sourceAsset,
        address targetAsset
    ) external;

    /// @notice Read a stored receipt. `settledAt == 0` means none exists.
    function get(bytes32 intentId) external view returns (Attestation memory);

    /// @notice Number of receipts ever written.
    function count() external view returns (uint256);
}
