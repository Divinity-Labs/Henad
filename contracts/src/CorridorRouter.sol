// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {PayoutIntent} from "./PayoutIntent.sol";
import {IRateSource} from "./interfaces/IRateSource.sol";
import {IVenueAdapter} from "./interfaces/IVenueAdapter.sol";
import {IRateAttestation} from "./interfaces/IRateAttestation.sol";
import {IERC3009} from "./interfaces/external/IERC3009.sol";
import {Corridor} from "./libraries/Corridor.sol";

/// @title CorridorRouter
/// @notice The settlement contract. Pulls the payer's source asset, swaps it on
///         the registered venue straight to the recipient, measures what actually
///         arrived, compares it with the reference rate, and writes the receipt.
/// @dev Two entry points converge on `_settle` (docs/CONTRACTS-SPEC.md, "The
///      settlement flow"):
///        * `settle`                  path B, the payer (or its 7702 delegate) is msg.sender and has approved;
///        * `settleWithAuthorization` path A, anyone submits the payer's ERC-3009 signature.
///      The payer's single signature authorises everything; no intent is ever
///      "opened" on-chain. Delivered amount is the recipient's balance delta, never
///      the venue's report. The reference rate is read before the swap so a stale
///      feed fails fast, and it is never used to derive a minimum output
///      (docs/INTEGRATION-FACTS.md §14.3).
///
///      Owner powers, exhaustively: `registerCorridor` (once per pair), `repointCorridor`
///      (that pair's rate source and venue, and nothing else) and the Ownable2Step
///      ownership hand-over. The owner cannot pause, upgrade, sweep funds, remove a
///      corridor, change a corridor's assets or id, or touch a receipt. There is no
///      receive or fallback function, so the contract cannot hold native tokens.
///
///      Because there is no sweep, `_settle` refuses an intent whose recipient is this
///      router or the corridor's venue adapter (`InvalidRecipient`): tokens delivered
///      to either would be stuck forever. The constructor likewise refuses an
///      attestation that is not already bound to this address (`AttestationMisbound`),
///      so a mispredicted CREATE nonce fails on deploy rather than after the first swap.
///
///      Reentrancy: both entry points are `nonReentrant` (transient storage, live on
///      Monad). Checks-effects-interactions is not fully achievable because the swap
///      must precede the receipt, so the guard is the defence; `_markFilled` runs
///      before `attest`.
contract CorridorRouter is PayoutIntent, Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Everything the router needs to settle one (sourceAsset, targetAsset) pair.
    struct CorridorConfig {
        bytes32 corridor; // keccak256("USD/GBP"), for the receipt
        IRateSource rateSource;
        IVenueAdapter venue;
        uint8 sourceDecimals; // read from the token at registration
        uint8 targetDecimals;
    }

    /// @notice The append-only receipt store this router writes to. Fixed at construction;
    ///         the attestation was itself constructed with this router's predicted address.
    IRateAttestation public immutable attestation;

    /// @notice Registered corridors, keyed by (sourceAsset, targetAsset). Registered once;
    ///         thereafter only the rate source and venue may be repointed.
    mapping(address sourceAsset => mapping(address targetAsset => CorridorConfig)) public corridors;

    /// @notice Emitted once per corridor, at registration.
    event CorridorRegistered(
        address indexed sourceAsset,
        address indexed targetAsset,
        bytes32 indexed corridor,
        address rateSource,
        address venue
    );

    /// @notice Emitted when a corridor's rate source or venue changes. Names both the
    ///         outgoing and incoming addresses, so the history is readable from logs
    ///         alone without archive state.
    event CorridorRepointed(
        address indexed sourceAsset,
        address indexed targetAsset,
        bytes32 indexed corridor,
        address previousRateSource,
        address rateSource,
        address previousVenue,
        address venue
    );

    error CorridorNotRegistered(address sourceAsset, address targetAsset);
    error CorridorAlreadyRegistered(address sourceAsset, address targetAsset);
    error InsufficientDelivery(uint256 delivered, uint256 minOut);
    error SpreadTooWide(int256 spread, uint16 max);
    error AuthorizationUsed(bytes32 intentId);
    error ValueOverflow();
    error ZeroAddress();
    error AttestationMisbound();
    error SameAsset();
    error ZeroCorridor();
    error InvalidRecipient(address recipient);

    /// @param owner_        The only key that may register corridors. Zero reverts in Ownable.
    /// @param attestation_  The RateAttestation deployed one nonce earlier with this address predicted.
    /// @dev Reverts `AttestationMisbound` unless the attestation's immutable `router`
    ///      already equals this address. The pair is wired by CREATE nonce prediction
    ///      (script/Deploy.s.sol) and neither contract has a setter, so a mispredicted
    ///      nonce would otherwise produce a router whose every settlement reverts
    ///      `NotRouter` at the receipt write — after the swap. Failing here makes that
    ///      a deploy-time error instead of a first-payout error.
    constructor(address owner_, IRateAttestation attestation_) Ownable(owner_) {
        if (address(attestation_) == address(0)) revert ZeroAddress();
        if (attestation_.router() != address(this)) revert AttestationMisbound();
        attestation = attestation_;
    }

    // ---------------------------------------------------------------------
    // Owner: registration only
    // ---------------------------------------------------------------------

    /// @notice Register a corridor. Write-once per pair: the owner may add corridors,
    ///         never change or remove one.
    /// @dev Reverts `IRateSource.UnsupportedPair` unless `rateSource.isSupported(src, dst)`
    ///      and `IVenueAdapter.NoRoute` if `venue.status(src, dst) == NoRoute`. Token
    ///      decimals are read once here and stored so settlement never calls `decimals()`.
    ///      Also reverts `SameAsset` on `sourceAsset == targetAsset` (a corridor that
    ///      could never settle, since `_requireOpen` rejects same-asset intents, and on
    ///      Mento it would route X -> USDm -> X and burn two fees) and `ZeroCorridor` on
    ///      an empty corridor id (every receipt for the pair would carry a blank
    ///      identifier, which reads as "no corridor" off-chain).
    /// @param sourceAsset  Token the payer sends (AUSD, USDC).
    /// @param targetAsset  Token the recipient receives (GBPm, EURm, ...).
    /// @param corridor     Corridor id for the receipt, e.g. `Corridor.id("USD", "GBP")`.
    /// @param rateSource   Reference-rate source; recorded on every receipt for this pair.
    /// @param venue        Venue adapter that executes the swap.
    function registerCorridor(
        address sourceAsset,
        address targetAsset,
        bytes32 corridor,
        IRateSource rateSource,
        IVenueAdapter venue
    ) external onlyOwner {
        if (
            sourceAsset == address(0) || targetAsset == address(0) || address(rateSource) == address(0)
                || address(venue) == address(0)
        ) revert ZeroAddress();
        if (sourceAsset == targetAsset) revert SameAsset();
        if (corridor == bytes32(0)) revert ZeroCorridor();
        if (address(corridors[sourceAsset][targetAsset].venue) != address(0)) {
            revert CorridorAlreadyRegistered(sourceAsset, targetAsset);
        }
        if (!rateSource.isSupported(sourceAsset, targetAsset)) {
            revert IRateSource.UnsupportedPair(sourceAsset, targetAsset);
        }
        if (venue.status(sourceAsset, targetAsset) == IVenueAdapter.Status.NoRoute) {
            revert IVenueAdapter.NoRoute(sourceAsset, targetAsset);
        }

        corridors[sourceAsset][targetAsset] = CorridorConfig({
            corridor: corridor,
            rateSource: rateSource,
            venue: venue,
            sourceDecimals: IERC20Metadata(sourceAsset).decimals(),
            targetDecimals: IERC20Metadata(targetAsset).decimals()
        });

        emit CorridorRegistered(sourceAsset, targetAsset, corridor, address(rateSource), address(venue));
    }

    /// @notice Point a registered corridor at a different rate source or venue.
    /// @dev This is the one thing an immutable deployment could not otherwise survive:
    ///      Mento redeploying a pool, or Chainlink retiring a feed, would strand the pair
    ///      forever because registration is write-once and there is no upgrade path
    ///      (docs/UPGRADEABILITY.md). The pair, its corridor id and its stored decimals
    ///      never change, so receipts written before and after remain the same corridor.
    ///
    ///      What this does not hand the owner: a venue cannot take a payer anywhere the
    ///      payer's own signed intent does not allow, because `_settle` measures the
    ///      recipient's balance delta and reverts `InsufficientDelivery` below the
    ///      intent's minimum or `SpreadTooWide` past its cap. A rate source can misreport,
    ///      which is why every receipt records the address that priced it and this event
    ///      names the outgoing one.
    /// @param sourceAsset  Token the payer sends; must already be registered with `targetAsset`.
    /// @param targetAsset  Token the recipient receives.
    /// @param rateSource   Replacement reference-rate source. May equal the current one.
    /// @param venue        Replacement venue adapter. May equal the current one.
    function repointCorridor(address sourceAsset, address targetAsset, IRateSource rateSource, IVenueAdapter venue)
        external
        onlyOwner
    {
        if (address(rateSource) == address(0) || address(venue) == address(0)) revert ZeroAddress();

        CorridorConfig storage config = corridors[sourceAsset][targetAsset];
        if (address(config.venue) == address(0)) revert CorridorNotRegistered(sourceAsset, targetAsset);

        if (!rateSource.isSupported(sourceAsset, targetAsset)) {
            revert IRateSource.UnsupportedPair(sourceAsset, targetAsset);
        }
        if (venue.status(sourceAsset, targetAsset) == IVenueAdapter.Status.NoRoute) {
            revert IVenueAdapter.NoRoute(sourceAsset, targetAsset);
        }

        address previousRateSource = address(config.rateSource);
        address previousVenue = address(config.venue);
        config.rateSource = rateSource;
        config.venue = venue;

        emit CorridorRepointed(
            sourceAsset,
            targetAsset,
            config.corridor,
            previousRateSource,
            address(rateSource),
            previousVenue,
            address(venue)
        );
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Path B: the payer settles its own intent. `msg.sender` must equal
    ///         `intent.payer` (an EOA, or a 7702-delegated EOA executing a sponsored
    ///         userOp) and must have approved `sourceAmount` to this contract.
    /// @param intent The signed intent. Its EIP-712 hash is the intent id.
    /// @return delivered Target-asset base units that reached the recipient.
    function settle(Intent calldata intent) external nonReentrant returns (uint256 delivered) {
        if (msg.sender != intent.payer) revert NotPayer(msg.sender, intent.payer);
        bytes32 intentId = hashIntent(intent);

        IERC20(intent.sourceAsset).safeTransferFrom(intent.payer, address(this), intent.sourceAmount);

        delivered = _settle(intent, intentId);
    }

    /// @notice Path A: anyone (the relayer) submits the payer's ERC-3009
    ///         `ReceiveWithAuthorization` signature. The authorization must name this
    ///         contract as `to`, `sourceAmount` as value, `validAfter = 0`,
    ///         `validBefore = intent.deadline` and `nonce = hashIntent(intent)`, so the
    ///         one signature binds every intent field; a tampered intent fails at the
    ///         token with an invalid signature.
    /// @dev Reverts `AuthorizationUsed(intentId)` before touching the token if the
    ///      nonce is already consumed or cancelled there, so a relayer pre-flight gets
    ///      a router-level error instead of the token's.
    /// @param intent    The signed intent.
    /// @param signature 65-byte ECDSA (or ERC-1271 for delegated payers) over the ERC-3009 digest.
    /// @return delivered Target-asset base units that reached the recipient.
    function settleWithAuthorization(Intent calldata intent, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 delivered)
    {
        bytes32 intentId = hashIntent(intent);
        IERC3009 token = IERC3009(intent.sourceAsset);
        if (token.authorizationState(intent.payer, intentId)) revert AuthorizationUsed(intentId);

        token.receiveWithAuthorization(
            intent.payer, address(this), intent.sourceAmount, 0, intent.deadline, intentId, signature
        );

        delivered = _settle(intent, intentId);
    }

    /// @dev The one settlement routine, in the order given by the spec (steps 1-10).
    ///      Assumes `sourceAmount` of `sourceAsset` is already held by this contract.
    ///      Steps 5-7 live in `_swap` and 8-9 in `_record` only to keep the EVM stack
    ///      shallow; the order is unchanged.
    function _settle(Intent calldata intent, bytes32 intentId) private returns (uint256 delivered) {
        // 1. lifecycle + structural checks
        _requireOpen(intent, intentId);

        // 2. corridor
        CorridorConfig memory c = corridors[intent.sourceAsset][intent.targetAsset];
        if (address(c.venue) == address(0)) revert CorridorNotRegistered(intent.sourceAsset, intent.targetAsset);

        // 2b. the recipient may not be this router or the venue adapter. Neither has a
        //     sweep — deliberately, so that no key can move a user's funds — so target
        //     tokens delivered to either would be stuck forever. Checked after the
        //     corridor lookup because the venue is per-corridor, and before the swap,
        //     so nothing has moved when it fires.
        if (intent.recipient == address(this) || intent.recipient == address(c.venue)) {
            revert InvalidRecipient(intent.recipient);
        }

        // 3. reference, read before the swap: a stale feed fails fast, before any token moves.
        //    Never used to derive a minimum output.
        (uint256 referenceRate,, bytes32 observation) = c.rateSource.getRate(intent.sourceAsset, intent.targetAsset);

        // 4. minimum output from the payer-signed quote and tolerance only
        uint256 minOut = minAmountOut(intent);

        // 5-7. swap and measure
        delivered = _swap(intent, c.venue, minOut);

        // 8-9. spread check, mark filled, receipt
        _record(intent, intentId, c, referenceRate, observation, delivered);

        // 10.
        return delivered;
    }

    /// @dev Steps 5-7: snapshot the recipient, fund the venue, swap, measure the delta.
    function _swap(Intent calldata intent, IVenueAdapter venue, uint256 minOut) private returns (uint256 delivered) {
        // 5. snapshot
        IERC20 target = IERC20(intent.targetAsset);
        uint256 before = target.balanceOf(intent.recipient);

        // 6. fund the venue and swap straight to the recipient
        IERC20(intent.sourceAsset).safeTransfer(address(venue), intent.sourceAmount);
        venue.swap(intent.sourceAsset, intent.targetAsset, intent.sourceAmount, minOut, intent.recipient);

        // 7. the balance delta is the truth (target stables have no hooks or fees)
        delivered = target.balanceOf(intent.recipient) - before;
        if (delivered < minOut) revert InsufficientDelivery(delivered, minOut);
    }

    /// @dev Steps 8-9: executed rate, spread limit, `_markFilled`, then the receipt.
    function _record(
        Intent calldata intent,
        bytes32 intentId,
        CorridorConfig memory c,
        uint256 referenceRate,
        bytes32 observation,
        uint256 delivered
    ) private {
        // 8. executed rate and disclosed spread
        uint256 executedRate = Corridor.executedRate(intent.sourceAmount, c.sourceDecimals, delivered, c.targetDecimals);
        int256 spread = Corridor.spreadBps(referenceRate, executedRate);
        if (spread > int256(uint256(intent.maxSpreadBps))) revert SpreadTooWide(spread, intent.maxSpreadBps);

        // 9. effects before the external receipt write
        _markFilled(intentId);
        IRateAttestation.Attestation memory a = IRateAttestation.Attestation({
            corridor: c.corridor,
            referenceObservation: observation,
            referenceRate: _toUint128(referenceRate),
            executedRate: _toUint128(executedRate),
            sourceAmount: _toUint128(intent.sourceAmount),
            deliveredAmount: _toUint128(delivered),
            rateSource: address(c.rateSource),
            spreadBps: _toInt32(spread),
            settledAt: _toUint64(block.timestamp),
            venue: address(c.venue),
            settledAtBlock: _toUint64(block.number)
        });
        attestation.attest(intentId, a, intent.payer, intent.recipient, intent.sourceAsset, intent.targetAsset);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Pre-flight for the client and relayer. Never reverts.
    /// @dev Each external read is wrapped in try/catch. `quotedOut == 0` means the
    ///      venue cannot price right now; `referenceRate == 0` means the rate source
    ///      cannot quote (stale or invalid feed). `status` is the venue's tradability,
    ///      except: an unregistered pair reports `NoRoute`, a venue whose `status`
    ///      itself reverts reports `NoRoute`, and a venue that is `Open` while the
    ///      reference read fails reports `OracleStale`, because settlement would
    ///      revert at step 3 of `_settle` in that case.
    /// @param sourceAsset  Token the payer would send.
    /// @param targetAsset  Token the recipient would receive.
    /// @param amountIn     Source-asset base units to price.
    /// @return quotedOut     Venue quote in target base units (0 if unavailable).
    /// @return referenceRate Reference rate, 1e18 target per source (0 if unavailable).
    /// @return status        Tradability as described above.
    function previewQuote(address sourceAsset, address targetAsset, uint256 amountIn)
        external
        view
        returns (uint256 quotedOut, uint256 referenceRate, IVenueAdapter.Status status)
    {
        CorridorConfig memory c = corridors[sourceAsset][targetAsset];
        if (address(c.venue) == address(0)) return (0, 0, IVenueAdapter.Status.NoRoute);

        try c.venue.status(sourceAsset, targetAsset) returns (IVenueAdapter.Status s) {
            status = s;
        } catch {
            status = IVenueAdapter.Status.NoRoute;
        }

        try c.venue.quote(sourceAsset, targetAsset, amountIn) returns (uint256 q) {
            quotedOut = q;
        } catch {}

        try c.rateSource.getRate(sourceAsset, targetAsset) returns (uint256 r, uint64, bytes32) {
            referenceRate = r;
        } catch {
            if (status == IVenueAdapter.Status.Open) status = IVenueAdapter.Status.OracleStale;
        }
    }

    // ---------------------------------------------------------------------
    // Narrowing casts guarded by ValueOverflow
    // ---------------------------------------------------------------------

    function _toUint128(uint256 v) private pure returns (uint128) {
        if (v > type(uint128).max) revert ValueOverflow();
        return uint128(v);
    }

    function _toUint64(uint256 v) private pure returns (uint64) {
        if (v > type(uint64).max) revert ValueOverflow();
        return uint64(v);
    }

    function _toInt32(int256 v) private pure returns (int32) {
        if (v > type(int32).max || v < type(int32).min) revert ValueOverflow();
        return int32(v);
    }
}
