// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IRateSource} from "../interfaces/IRateSource.sol";
import {AggregatorV3Interface} from "../interfaces/external/AggregatorV3Interface.sol";
import {Corridor} from "../libraries/Corridor.sol";

/// @title ChainlinkRateSource
/// @notice IRateSource that composes two Chainlink fiat feeds per asset pair:
///         rate = (sourceAsset / USD) / (targetCurrency / USD), 1e18 fixed point,
///         e.g. AUSD -> GBPm = AUSD/USD ÷ GBP/USD ≈ 0.74e18.
/// @dev Immutable feed registry configured entirely in the constructor: no owner,
///      no setters, no upgrade path. Feed decimals are read once at construction
///      and stored, so a later change on a proxy cannot alter how its answers are
///      scaled. The observation packs both Chainlink round ids so anyone can replay
///      a receipt with `getRoundData` on the proxies (docs/INTEGRATION-FACTS.md §14.3).
///      The reference is provenance for the receipt only; it is never a min-out guard.
contract ChainlinkRateSource is IRateSource {
    /// @notice Constructor input: one composed pair.
    struct FeedPair {
        address sourceAsset; // e.g. AUSD
        address targetAsset; // e.g. GBPm
        AggregatorV3Interface base; // sourceAsset / USD, e.g. AUSD/USD (8 dec)
        AggregatorV3Interface quote; // targetCurrency / USD, e.g. GBP/USD (18 dec)
        uint32 baseMaxAge; // seconds; 5400 for AUSD/USD and USDC/USD
        uint32 quoteMaxAge; // seconds; 600 for GBP/USD, EUR/USD, CHF/USD, JPY/USD
    }

    /// @dev Stored per pair. Packed into two contiguous slots so one `getRate`
    ///      touches a single MIP-8 storage page (docs/INTEGRATION-FACTS.md §14.5).
    struct Feed {
        AggregatorV3Interface base; // slot 0: 20 bytes
        uint32 baseMaxAge; // slot 0: 4 bytes
        uint8 baseDecimals; // slot 0: 1 byte
        uint8 quoteDecimals; // slot 0: 1 byte
        AggregatorV3Interface quote; // slot 1: 20 bytes
        uint32 quoteMaxAge; // slot 1: 4 bytes
    }

    string private constant NAME = "chainlink:composed-fiat-feeds";

    /// @dev Answers are lifted to this many decimals before composing; equals RATE_DECIMALS.
    uint8 private constant MAX_FEED_DECIMALS = 18;

    mapping(address sourceAsset => mapping(address targetAsset => Feed)) private _feeds;

    error ZeroAddress();
    error ZeroMaxAge(address feed);
    error DuplicatePair(address sourceAsset, address targetAsset);
    error UnsupportedFeedDecimals(address feed, uint8 decimals);

    /// @param pairs The complete and final registry. Reverts on a zero address, a
    ///              zero max age, a duplicate (sourceAsset, targetAsset), or a feed
    ///              whose `decimals()` exceeds 18. Each feed's decimals are read here
    ///              exactly once and stored.
    constructor(FeedPair[] memory pairs) {
        uint256 n = pairs.length;
        for (uint256 i = 0; i < n; ++i) {
            FeedPair memory p = pairs[i];
            if (
                p.sourceAsset == address(0) || p.targetAsset == address(0) || address(p.base) == address(0)
                    || address(p.quote) == address(0)
            ) revert ZeroAddress();
            if (p.baseMaxAge == 0) revert ZeroMaxAge(address(p.base));
            if (p.quoteMaxAge == 0) revert ZeroMaxAge(address(p.quote));

            Feed storage f = _feeds[p.sourceAsset][p.targetAsset];
            if (address(f.base) != address(0)) revert DuplicatePair(p.sourceAsset, p.targetAsset);

            uint8 baseDecimals = p.base.decimals();
            if (baseDecimals > MAX_FEED_DECIMALS) revert UnsupportedFeedDecimals(address(p.base), baseDecimals);
            uint8 quoteDecimals = p.quote.decimals();
            if (quoteDecimals > MAX_FEED_DECIMALS) revert UnsupportedFeedDecimals(address(p.quote), quoteDecimals);

            f.base = p.base;
            f.baseMaxAge = p.baseMaxAge;
            f.baseDecimals = baseDecimals;
            f.quoteDecimals = quoteDecimals;
            f.quote = p.quote;
            f.quoteMaxAge = p.quoteMaxAge;
        }
    }

    /// @inheritdoc IRateSource
    function RATE_DECIMALS() external pure returns (uint8) {
        return Corridor.RATE_DECIMALS;
    }

    /// @inheritdoc IRateSource
    function name() external pure returns (string memory) {
        return NAME;
    }

    /// @inheritdoc IRateSource
    function isSupported(address sourceAsset, address targetAsset) external view returns (bool) {
        return address(_feeds[sourceAsset][targetAsset].base) != address(0);
    }

    /// @notice The feed configuration for a pair plus the decimals stored at construction.
    /// @dev Reverts `UnsupportedPair` for an unregistered pair so a caller can never
    ///      mistake an empty entry for a real configuration.
    /// @return pair          The pair exactly as it was passed to the constructor.
    /// @return baseDecimals  `pair.base.decimals()` as read at construction.
    /// @return quoteDecimals `pair.quote.decimals()` as read at construction.
    function feeds(address sourceAsset, address targetAsset)
        external
        view
        returns (FeedPair memory pair, uint8 baseDecimals, uint8 quoteDecimals)
    {
        Feed storage f = _feeds[sourceAsset][targetAsset];
        if (address(f.base) == address(0)) revert UnsupportedPair(sourceAsset, targetAsset);
        pair = FeedPair({
            sourceAsset: sourceAsset,
            targetAsset: targetAsset,
            base: f.base,
            quote: f.quote,
            baseMaxAge: f.baseMaxAge,
            quoteMaxAge: f.quoteMaxAge
        });
        baseDecimals = f.baseDecimals;
        quoteDecimals = f.quoteDecimals;
    }

    /// @inheritdoc IRateSource
    /// @dev Both feeds are validated (answer > 0, 0 < updatedAt <= now) before either
    ///      is checked for age, so an invalid answer is always reported as
    ///      `InvalidReferenceAnswer` even when it is also stale. Rounding is floor.
    function getRate(address sourceAsset, address targetAsset)
        external
        view
        returns (uint256 rate, uint64 updatedAt, bytes32 observation)
    {
        Feed storage f = _feeds[sourceAsset][targetAsset];
        AggregatorV3Interface base = f.base;
        if (address(base) == address(0)) revert UnsupportedPair(sourceAsset, targetAsset);
        AggregatorV3Interface quote = f.quote;

        (uint80 roundIdBase, int256 answerBase,, uint256 updatedAtBase,) = base.latestRoundData();
        (uint80 roundIdQuote, int256 answerQuote,, uint256 updatedAtQuote,) = quote.latestRoundData();

        _requireValid(address(base), answerBase, updatedAtBase);
        _requireValid(address(quote), answerQuote, updatedAtQuote);
        _requireFresh(address(base), updatedAtBase, f.baseMaxAge);
        _requireFresh(address(quote), updatedAtQuote, f.quoteMaxAge);

        // Lift both answers to 18 decimals, then rate = floor(base * 1e18 / quote).
        // The exponents cannot underflow: decimals <= 18 was enforced in the constructor.
        rate = Math.mulDiv(
            uint256(answerBase) * 10 ** uint256(MAX_FEED_DECIMALS - f.baseDecimals),
            Corridor.ONE,
            uint256(answerQuote) * 10 ** uint256(MAX_FEED_DECIMALS - f.quoteDecimals)
        );
        // Both timestamps are <= block.timestamp (checked above), so the cast is lossless.
        updatedAt = uint64(updatedAtBase < updatedAtQuote ? updatedAtBase : updatedAtQuote);
        observation = bytes32((uint256(roundIdBase) << 80) | uint256(roundIdQuote));
    }

    /// @dev Chainlink semantics: answer must be positive and updatedAt must be a real,
    ///      non-future timestamp (a 0 means the round never completed).
    function _requireValid(address feed, int256 answer, uint256 feedUpdatedAt) private view {
        if (answer <= 0 || feedUpdatedAt == 0 || feedUpdatedAt > block.timestamp) {
            revert InvalidReferenceAnswer(feed, answer);
        }
    }

    /// @dev `feedUpdatedAt <= block.timestamp` is guaranteed by `_requireValid`, so the
    ///      subtraction cannot underflow. Exactly `maxAge` old is still fresh.
    function _requireFresh(address feed, uint256 feedUpdatedAt, uint32 maxAge) private view {
        if (block.timestamp - feedUpdatedAt > maxAge) revert StaleReferenceRate(feed, feedUpdatedAt, maxAge);
    }
}
