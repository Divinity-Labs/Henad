# Contracts spec — week 2

The facts behind every decision here are in `docs/INTEGRATION-FACTS.md` §14. Read
that first. This document says what to build; that one says why.

## Layout

```
contracts/src/
  PayoutIntent.sol            DONE  abstract: EIP-712 intent hash, None/Filled/Cancelled, minAmountOut
  RateAttestation.sol         DONE  append-only receipt store, router-only writer, no admin
  CorridorRouter.sol          TODO  the settlement contract; inherits PayoutIntent
  adapters/
    ChainlinkRateSource.sol   TODO  IRateSource: composes two Chainlink fiat feeds per asset pair
    MentoVenueAdapter.sol     TODO  IVenueAdapter: two-hop swap through Mento V3 Router via USDm
  interfaces/                 DONE  IRateSource, IVenueAdapter, IRateAttestation
  interfaces/external/        DONE  IMentoRouter, IFPMM, IOracleAdapter, IMarketHoursBreaker,
                                    AggregatorV3Interface, IERC3009
  libraries/Corridor.sol      DONE  corridor id, executedRate, spreadBps (fuzz-tested)
contracts/test/
  utils/MonadMainnet.sol      DONE  verified mainnet addresses
  utils/ForkTest.sol          DONE  fork base, _dealAUSD (vm.store), pinned block
  Corridor.t.sol, PayoutIntent.t.sol, RateAttestation.t.sol   DONE
  ChainlinkRateSource.t.sol   TODO  unit (mock aggregators) + fork
  MentoVenueAdapter.t.sol     TODO  fork
  CorridorRouter.t.sol        TODO  unit with mocks (both paths)
  fork/Settlement.t.sol       TODO  integration: real Mento, real feeds, both paths, real EntryPoint
contracts/script/
  Deploy.s.sol                TODO  CREATE-address prediction for the attestation/router pair
```

Toolchain: Foundry 1.8.1, solc 0.8.31, `evm_version = "osaka"`, `network = "monad"`,
`hardfork = "monad:MonadTen"`. OpenZeppelin v5.7.0 is vendored at
`@openzeppelin/contracts/`. Custom errors everywhere, NatSpec on every external
function, `SafeERC20` for every token call, no `tx.origin`, no assembly unless
justified in a comment.

## The settlement flow

Both paths converge on one internal function. The payer's single signature
authorises everything; there is no on-chain "open" intent.

```
Path A (relayer pays gas)                       Path B (Pimlico paymaster pays gas)
------------------------------------------      --------------------------------------------
payer signs ERC-3009 ReceiveWithAuthorization   payer's EOA is 7702-delegated to Simple7702Account
  from   = intent.payer                         bundler submits a sponsored userOp:
  to     = CorridorRouter                         executeBatch([
  value  = intent.sourceAmount                      AUSD.approve(router, sourceAmount),
  validAfter  = 0                                   router.settle(intent)
  validBefore = intent.deadline                   ])
  nonce  = hashIntent(intent)                   router sees msg.sender == intent.payer
relayer calls
  router.settleWithAuthorization(intent, sig)
router calls
  AUSD.receiveWithAuthorization(payer, this,
    sourceAmount, 0, deadline, intentId, sig)
------------------------------------------      --------------------------------------------
                       both -> _settle(intent, intentId)
```

`_settle(intent, intentId)`:

1. `_requireOpen(intent, intentId)` (PayoutIntent).
2. `CorridorConfig c = corridors[intent.sourceAsset][intent.targetAsset]`; revert
   `CorridorNotRegistered` if unset.
3. Read the reference: `(referenceRate, updatedAt, observation) = c.rateSource.getRate(sourceAsset, targetAsset)`.
   Reading before the swap fails fast on a stale feed. The reference is **never**
   used to compute a minimum output (§14.3).
4. `minOut = minAmountOut(intent)` (venue quote × (1 − tolerance), both signed by the payer).
5. Snapshot `before = IERC20(targetAsset).balanceOf(recipient)`.
6. `SafeERC20.safeTransfer(sourceAsset, address(c.venue), sourceAmount)`;
   `c.venue.swap(sourceAsset, targetAsset, sourceAmount, minOut, recipient)`.
7. `delivered = balanceOf(recipient) − before`; revert `InsufficientDelivery` if `delivered < minOut`.
   (GBPm/USDm/EURm/… are plain ERC20Upgradeable with no hooks; the delta is the truth.)
8. `executedRate = Corridor.executedRate(sourceAmount, srcDec, delivered, dstDec)`;
   `spread = Corridor.spreadBps(referenceRate, executedRate)`;
   revert `SpreadTooWide(spread, intent.maxSpreadBps)` if `spread > int(maxSpreadBps)`.
9. `_markFilled(intentId)`; build the packed `Attestation` (revert `ValueOverflow`
   on any narrowing cast); `attestation.attest(intentId, a, payer, recipient, sourceAsset, targetAsset)`.
10. Return `delivered`.

Reentrancy: `ReentrancyGuardTransient` on both entry points. Checks-effects-
interactions is not fully possible (the swap happens before the receipt), so the
guard is the defence; `_markFilled` happens before `attest`.

## CorridorRouter (TODO)

```solidity
contract CorridorRouter is PayoutIntent, Ownable2Step, ReentrancyGuardTransient {
    struct CorridorConfig {
        bytes32 corridor;      // keccak256("USD/GBP"), for the receipt
        IRateSource rateSource;
        IVenueAdapter venue;
        uint8 sourceDecimals;  // read from the token at registration
        uint8 targetDecimals;
    }
    IRateAttestation public immutable attestation;
    mapping(address sourceAsset => mapping(address targetAsset => CorridorConfig)) public corridors;

    event CorridorRegistered(address indexed sourceAsset, address indexed targetAsset, bytes32 indexed corridor, address rateSource, address venue);

    constructor(address owner_, IRateAttestation attestation_);

    /// Write-once per pair. Owner may add corridors, never change or remove one.
    /// Reverts unless rateSource.isSupported(src, dst) and venue.status(src, dst) != NoRoute.
    function registerCorridor(address sourceAsset, address targetAsset, bytes32 corridor, IRateSource rateSource, IVenueAdapter venue) external onlyOwner;

    /// Path B. msg.sender must equal intent.payer. Pulls via safeTransferFrom.
    function settle(Intent calldata intent) external nonReentrant returns (uint256 delivered);

    /// Path A. Anyone may submit. Pulls via receiveWithAuthorization with nonce = intentId.
    /// Reverts AuthorizationUsed(intentId) early if IERC3009(sourceAsset).authorizationState(payer, intentId).
    function settleWithAuthorization(Intent calldata intent, bytes calldata signature) external nonReentrant returns (uint256 delivered);

    /// View helpers for the client and relayer pre-flight (must not revert):
    function previewQuote(address sourceAsset, address targetAsset, uint256 amountIn) external view returns (uint256 quotedOut, uint256 referenceRate, IVenueAdapter.Status status);
}
```

Errors: `CorridorNotRegistered(src,dst)`, `CorridorAlreadyRegistered(src,dst)`,
`InsufficientDelivery(delivered, minOut)`, `SpreadTooWide(int256 spread, uint16 max)`,
`AuthorizationUsed(intentId)`, `ValueOverflow()`, `ZeroAddress()`.

The owner key can only register new corridors. It cannot pause, upgrade, sweep,
or touch a receipt. Say so in NatSpec.

## ChainlinkRateSource (TODO)

Immutable feed registry, configured entirely in the constructor. No setters.

```solidity
struct FeedPair {
    address sourceAsset; address targetAsset;
    AggregatorV3Interface base;   // sourceAsset / USD, e.g. AUSD/USD (8 dec)
    AggregatorV3Interface quote;  // targetCurrency / USD, e.g. GBP/USD (18 dec)
    uint32 baseMaxAge;            // 5400 s for AUSD/USD, USDC/USD
    uint32 quoteMaxAge;           // 600 s for GBP/USD, EUR/USD, CHF/USD, JPY/USD
}
constructor(FeedPair[] memory pairs)   // reads decimals() once and stores them; reverts if a feed answers decimals() > 18
function feeds(address sourceAsset, address targetAsset) external view returns (FeedPair memory + decimals)
function getRate(src, dst):
    (rb, ab, , ub, ) = base.latestRoundData(); (rq, aq, , uq, ) = quote.latestRoundData();
    revert InvalidReferenceAnswer if ab <= 0 or aq <= 0 or ub == 0 or uq == 0 or ub > now or uq > now
    revert StaleReferenceRate if now - ub > baseMaxAge or now - uq > quoteMaxAge
    rate = mulDiv(uint(ab) * 10**(18-baseDec), 1e18, uint(aq) * 10**(18-quoteDec))   // floor
    updatedAt = min(ub, uq); observation = bytes32((uint256(rb) << 80) | rq)
name() = "chainlink:composed-fiat-feeds"
```

Test vector at block 103613028: AUSD/USD 99984996 (8 dec), GBP/USD 1350240000000000000
→ rate 740497955918947742. Unit tests with a `MockAggregator` (settable answer,
updatedAt, decimals, roundId): composition, both staleness bounds, negative
answer, zero updatedAt, future updatedAt, decimals 8/18 mixes, observation packing,
unsupported pair. Fork test: read the real pair at PINNED_BLOCK, replay via
`getRoundData` on both proxies from the observation and assert equality.

## MentoVenueAdapter (TODO)

```solidity
constructor(IMentoRouter mentoRouter, address usdm)
function _routes(assetIn, assetOut) internal pure returns (IMentoRouter.Route[] memory)
    // assetIn == USDm or assetOut == USDm -> one hop, else [assetIn->USDm, USDm->assetOut]; factory = address(0)
function quote(assetIn, assetOut, amountIn) view -> mentoRouter.getAmountsOut(amountIn, routes)[last]
function swap(assetIn, assetOut, amountIn, minOut, recipient):
    SafeERC20.forceApprove(assetIn, mentoRouter, amountIn)
    amounts = mentoRouter.swapExactTokensForTokens(amountIn, minOut, routes, recipient, block.timestamp)
    return amounts[last]
function status(assetIn, assetOut) view -> Status:
    for each hop: pool = mentoRouter.poolFor(from, to, address(0)); if pool.code.length == 0 -> NoRoute
      adapter = IFPMM(pool).oracleAdapter(); id = IFPMM(pool).referenceRateFeedID()
      info = adapter.getRate(id)   // wrap in try/catch -> NoRoute on revert
      if !info.isFXMarketOpen -> MarketClosed; if !info.isRecent -> OracleStale; if tradingMode != 0 -> TradingSuspended
    return Open
name() = "mento:v3-router"
```

The adapter holds no funds between calls and has no owner. `recipient` must not
be a pool token address (Mento reverts `InvalidToAddress`); the router does not
need to check this, the revert bubbles.

Fork tests at PINNED_BLOCK: quote(AUSD→GBPm, 1e6) equals `getAmountsOut` and the
swap delivers exactly that amount to a fresh recipient (fund the adapter via
`_dealAUSD`); the same for USDC→GBPm, AUSD→EURm, AUSD→CHFm, AUSD→JPYm; `status`
is Open. At `MonadMainnet.SATURDAY_BLOCK`: status(AUSD, GBPm) == MarketClosed, quote
reverts with `IOracleAdapter.FXMarketClosed`, status(AUSD, USDm) == Open. Fee
sanity: delivered ≈ oracle × (1 − 20 bps) within 1 bps for the two-hop route.

## Integration tests (TODO, after the three above merge)

`test/fork/Settlement.t.sol`, at PINNED_BLOCK, deploying the real stack
(ChainlinkRateSource with AUSD→GBPm and USDC→GBPm pairs, MentoVenueAdapter,
RateAttestation with predicted router address, CorridorRouter, registered corridors):

- Path A: payer key signs the ERC-3009 authorization (domain "Agora Dollar"/"1",
  chain 143, AUSD) with nonce = hashIntent; relayer calls `settleWithAuthorization`;
  assert recipient GBPm delta == quotedAmountOut (same block), receipt stored with
  spread in [19, 21] bps, `PayoutSettled` emitted, intent Filled, replay reverts,
  tampered intent reverts at the token, cancelled-at-token authorization reverts.
- Path A with a 7702-delegated payer (vm.signDelegation/attachDelegation to
  Simple7702Account) on AUSD and on USDC.
- Path B: real EntryPoint v0.8 `handleOps` with a stub paymaster, executeBatch
  [approve, settle]; payer MON balance unchanged; template is
  `scratch/erc3009/probe/test/HandleOps.t.sol` (read it, then write ours).
- Reference replay: from the receipt's observation, `getRoundData` on both
  Chainlink proxies reproduces `referenceRate`.
- Spread limit: maxSpreadBps = 5 reverts `SpreadTooWide`; tolerance 0 with a
  stale quote reverts `InsufficientOutputAmount` from Mento.
- Saturday block: `settle` reverts with `FXMarketClosed` bubbled from Mento.
- Gas: assert path A tx gas < 1.45M and print it (Monad bills the limit).

## Deploy script (TODO)

`script/Deploy.s.sol`: `vm.computeCreateAddress(deployer, nonce + 1)` for the
router, deploy `RateAttestation(predictedRouter)`, then `CorridorRouter(owner,
attestation)`, assert `address(router) == predicted`. Then `ChainlinkRateSource`,
`MentoVenueAdapter`, `registerCorridor` for AUSD→GBPm, USDC→GBPm, AUSD→EURm,
AUSD→CHFm, AUSD→JPYm. Write the addresses to `deployments/<chainId>.json`.
Verification commands are in §14.5 of the facts file (Sourcify on BlockVision
plus Etherscan V2).

## Non-goals this week

No Kuru adapter. No pause. No upgradeability. No fee for Henad. No NGN.
