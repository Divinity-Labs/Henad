# Contracts spec — week 2

The facts behind every decision here are in `docs/INTEGRATION-FACTS.md` §14. Read
that first. This document says what to build; that one says why.

## Layout

```
contracts/src/
  PayoutIntent.sol            DONE  abstract: EIP-712 intent hash, None/Filled/Cancelled, minAmountOut
  RateAttestation.sol         DONE  append-only receipt store, router-only writer, no admin
  CorridorRouter.sol          DONE  the settlement contract; inherits PayoutIntent
  adapters/
    ChainlinkRateSource.sol   DONE  IRateSource: composes two Chainlink fiat feeds per asset pair
    MentoVenueAdapter.sol     DONE  IVenueAdapter: two-hop swap through Mento V3 Router via USDm
  interfaces/                 DONE  IRateSource, IVenueAdapter, IRateAttestation
  interfaces/external/        DONE  IMentoRouter, IFPMM, IOracleAdapter, IMarketHoursBreaker,
                                    AggregatorV3Interface, IERC3009
  libraries/Corridor.sol      DONE  corridor id, executedRate, spreadBps (fuzz-tested)
contracts/test/
  utils/MonadMainnet.sol      DONE  verified mainnet addresses
  utils/ForkTest.sol          DONE  fork base, _dealAUSD (vm.store), pinned block
  Corridor.t.sol, PayoutIntent.t.sol, RateAttestation.t.sol   DONE
  ChainlinkRateSource.t.sol   DONE  unit (mock aggregators) + fork/ChainlinkRateSource.fork.t.sol
  fork/MentoVenueAdapter.fork.t.sol  DONE
  CorridorRouter.t.sol        DONE  unit with mocks (both paths)
  Deploy.t.sol                DONE  unit: per-chain address table + deployment-record path
  fork/Settlement.fork.t.sol  DONE  integration: real Mento, real feeds, both paths, real EntryPoint
contracts/script/
  Deploy.s.sol                DONE  CREATE-address prediction for the attestation/router pair
  DeployThrowaway.s.sol       DONE  one trivial contract, to prove the toolchain on mainnet first
```

Status: 172 tests green (128 unit, 44 fork). Three files committed before this branch
(`libraries/Corridor.sol`, `test/Corridor.t.sol`, `test/PayoutIntent.t.sol`) are not
`forge fmt` clean; left alone here to avoid conflicting with parallel branches.

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

## CorridorRouter (DONE)

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

    /// Registered once per pair. Owner may add corridors, never remove one.
    /// Reverts unless rateSource.isSupported(src, dst) and venue.status(src, dst) != NoRoute.
    function registerCorridor(address sourceAsset, address targetAsset, bytes32 corridor, IRateSource rateSource, IVenueAdapter venue) external onlyOwner;

    /// Replace a registered pair's rate source and venue, and nothing else: the pair, its
    /// corridor id and its stored decimals are fixed at registration. Same two guards as
    /// registration. Emits CorridorRepointed(src, dst, corridor, oldSource, newSource, oldVenue, newVenue).
    /// Exists so a Mento pool redeploy or a retired Chainlink feed cannot strand a corridor
    /// forever (docs/UPGRADEABILITY.md).
    function repointCorridor(address sourceAsset, address targetAsset, IRateSource rateSource, IVenueAdapter venue) external onlyOwner;

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
`AuthorizationUsed(intentId)`, `ValueOverflow()`, `ZeroAddress()`,
`AttestationMisbound()`, `SameAsset()`, `ZeroCorridor()`, `InvalidRecipient(address)`.

The owner key can register a corridor and repoint an existing one's rate source and
venue. It cannot pause, upgrade, sweep, remove a corridor, change a corridor's assets
or id, or touch a receipt. Say so in NatSpec.

Hardening added after the merge review:

- The constructor reverts `AttestationMisbound()` unless `attestation_.router()` is
  already `address(this)`. Neither contract has a setter, so a mispredicted CREATE
  nonce would otherwise produce a router whose every settlement reverts `NotRouter`
  at the receipt write — after the swap. It now fails on deploy instead.
- `registerCorridor` reverts `SameAsset()` when `sourceAsset == targetAsset` (an
  intent for such a corridor can never pass `_requireOpen`, and on Mento it would
  route X → USDm → X and burn two fees) and `ZeroCorridor()` on an empty corridor
  id (every receipt for the pair would read as "no corridor" off-chain).
- Step 2b of `_settle` reverts `InvalidRecipient(address)` when `intent.recipient`
  is the router or the corridor's venue adapter. There is deliberately no sweep on
  either, so tokens delivered there would be stuck forever. Checked after the
  corridor lookup (the venue is per-corridor) and before the swap.

## ChainlinkRateSource (DONE)

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

## MentoVenueAdapter (DONE)

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

## Integration tests (DONE)

`test/fork/Settlement.fork.t.sol`, at PINNED_BLOCK, deploying the real stack in the
exact order `script/Deploy.s.sol` uses (ChainlinkRateSource with all five pairs,
MentoVenueAdapter, RateAttestation at the predicted router address, CorridorRouter,
five registered corridors). Every expected amount is `IMentoRouter.getAmountsOut`
read in the same block, never the adapter or router under test; every expected rate
is replayed out of the Chainlink proxies by round id. 18 tests:

- Path A: payer key signs the ERC-3009 authorization (domain "Agora Dollar"/"1",
  chain 143, AUSD, asserted against a hand-built domain) with nonce = hashIntent;
  relayer calls `settleWithAuthorization`; assert recipient GBPm delta ==
  quotedAmountOut == the same-block quote, receipt corridor/rateSource/venue,
  `PayoutSettled` emitted with the struct, intent Filled, token nonce consumed, no
  dust left on the router or adapter, replay reverts `AuthorizationUsed`, a tampered
  intent reverts at the token with `InvalidSignature` (0x8baa579f), and a
  cancelled-at-token authorization reverts `AuthorizationUsed`.
- The same for USDC, with Circle's own domain ("USDC"/"2").
- Path A with a 7702-delegated payer (vm.signDelegation/attachDelegation to
  Simple7702Account) on AUSD and on USDC — a payer who used path B once can still
  use path A.
- Path B: real EntryPoint v0.8 `handleOps` with a stub paymaster, executeBatch
  [approve, settle]; the receipt's payer is the EOA, the payer's MON stays 0,
  `UserOperationEvent.success == true`. Soft failure: `maxSpreadBps = 1` makes
  `settle` revert inside the batch, `handleOps` still succeeds, `success == false`,
  no receipt, intent still None, payer's AUSD untouched.
- EUR, CHF and JPY corridors: one path-A settlement each, delivered == quote.
- Reference replay: from the receipt's observation, `getRoundData` on both
  Chainlink proxies reproduces `referenceRate`.
- Spread: the disclosed spread is asserted inside [15, 30] bps and logged. Measured
  19 bps on all five corridors at PINNED_BLOCK, matching §14.3's 19–21 in-sync band
  and §14.1's 19.99 bps two-hop fee. The window is wider than [19, 21] because the
  Chainlink reference and Mento's relay drift apart for up to a minute after each
  round (§14.3); [19, 21] would go red on a relay lag, not on a regression.
- Limits: maxSpreadBps = 5 reverts `SpreadTooWide` with the swap rolled back;
  quotedAmountOut = quote + 1 with tolerance 0 reverts `InsufficientOutputAmount`
  from Mento; a stale reference (warp +2 h) reverts `StaleReferenceRate` before any
  token moves; `previewQuote` reports Open with both numbers populated.
- Saturday block (through MONAD_ARCHIVE_RPC_URL): `settle` reverts with
  `FXMarketClosed` bubbled from Mento and `previewQuote` reports MarketClosed.
- Gas: path A measured with `gasleft()` and logged (Monad bills the limit).
  **1,471,301** at PINNED_BLOCK — Mento's own two-hop swap is 868,286 of that
  (59%), the two cold Chainlink proxy hops 122,593, the six-slot receipt plus its
  id push 180,772, `receiveWithAuthorization` 72,032, the router's own work
  ~185,000. §14.5's 1,254,338 predates both the sixth receipt slot
  (`referenceObservation`, added by §14.3) and the real router, which that probe
  stood in for with a mock; the guard in the test is therefore 1.55M, inside
  §14.5's own 1.6M cap. Path B's `actualGasUsed` from `UserOperationEvent`:
  1,803,204.

## Deploy script (DONE)

`script/Deploy.s.sol` deploys `ChainlinkRateSource` (five feed pairs), then
`MentoVenueAdapter`, then takes `vm.computeCreateAddress(deployer, nonce + 1)` for
the router, deploys `RateAttestation(predictedRouter)` and `CorridorRouter(owner,
attestation)`, and asserts both `address(router) == predicted` and
`attestation.router() == address(router)` (the router's constructor already refuses
the mismatch; these are belt and braces). Then `registerCorridor` for AUSD→GBPm,
USDC→GBPm, AUSD→EURm, AUSD→CHFm, AUSD→JPYm with `Corridor.id` ids, each read back
and asserted. Finally it writes the deployment record with `rateSource`,
`venueAdapter`, `rateAttestation`, `corridorRouter`, `owner`, `corridorsRegistered`,
`deployedAtBlock` and `corridors[]`, which needs the `write` fs_permission on
`./deployments` in `foundry.toml`.

The record is `deployments/<chainId>.json` **only on a broadcast**. A keyless run
still executes `run()` to completion from a simulated sender, so its addresses are
fiction; it writes `deployments/<chainId>.dry-run.json` instead (git-ignored), and
the rehearsal in "Deploy and verify" below therefore cannot overwrite a real record.
`Deploy.deploymentFile(chainId, broadcast)` picks the name and
`Deploy.isBroadcasting()` is the guard; both are unit-tested. `corridorsRegistered`
is `false` when the run only printed the calldata, so the file never claims corridors
that are not on-chain.

`OWNER` defaults to the deployer. When it is something else (a Safe), the script
deploys and prints the five `registerCorridor` calldatas for the owner to submit
rather than pretending to have registered them.

Addresses are taken per chain by `Deploy.config(chainId)`. Only 143 has a Mento
deployment, so every other chain — Monad testnet 10143 included — reverts
`NoMentoDeployment(chainId)` before anything is deployed. Registering the
mainnet-only corridors on testnet would otherwise point them at addresses with no
code. `test/Deploy.t.sol` covers the table and the record path; a dry run against
`https://testnet-rpc.monad.xyz` reverts with `NoMentoDeployment(10143)`.

`script/DeployThrowaway.s.sol` deploys one `ToolchainProbe` and nothing else.
Broadcast it first: no transaction has ever been sent on Monad mainnet with this
toolchain (§14.6), so the compiler settings, gas estimate, nonce handling and both
verification endpoints are unproven until it lands. Simulated cost 150,983 gas
(~0.031 MON at a 203 gwei max fee) against 6,190,540 gas (~1.26 MON) for the full
stack. Both figures are already `forge script`'s 130 % `--gas-estimate-multiplier`
applied to the raw estimate, priced at the max fee; at the 103 gwei a block actually
charges the full stack is ~0.64 MON. On Monad the padding is not refunded — gas is
billed on the limit (§14.5) — so lower `--gas-estimate-multiplier` only if you are
willing to risk an out-of-gas mid-sequence.

## Deploy and verify

Dry run — no key, no `--broadcast`; `DEPLOYER` only sets the simulated sender:

```bash
export MONAD_MAINNET_RPC_URL=https://rpc.monad.xyz
cd contracts

forge script script/DeployThrowaway.s.sol:DeployThrowaway --rpc-url $MONAD_MAINNET_RPC_URL
forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_MAINNET_RPC_URL
```

Broadcast, throwaway first:

```bash
export PRIVATE_KEY=0x...            # the deployer
export OWNER=0x...                  # optional; defaults to the deployer
export ETHERSCAN_API_KEY=...

forge script script/DeployThrowaway.s.sol:DeployThrowaway \
  --rpc-url $MONAD_MAINNET_RPC_URL --broadcast
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $MONAD_MAINNET_RPC_URL --broadcast
```

Constructor arguments for verification (`cast abi-encode`; substitute the addresses
the script printed for `<attestation>`, `<router>` and `<owner>`):

```bash
# ChainlinkRateSource(FeedPair[]) — (sourceAsset, targetAsset, base, quote, baseMaxAge, quoteMaxAge)
cast abi-encode "constructor((address,address,address,address,uint32,uint32)[])" \
"[(0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1,0xE20751C7B5867bCBef815ffc1b284c3f412a9e13,0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30,5400,600),\
(0x754704Bc059F8C67012fEd69BC8A327a5aafb603,0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1,0xf5F15f188AbCB0d165D1Edb7f37F7d6fA2fCebec,0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30,5400,600),\
(0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,0x4D502d735B4C574B487Ed641ae87cEaE884731C7,0xE20751C7B5867bCBef815ffc1b284c3f412a9e13,0x00D7E359c8CE46168eFDD4D65b708fFb16c4b99a,5400,600),\
(0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,0xF64e91fFEf7ef43aA314F0Bc2AC39f770797990C,0xE20751C7B5867bCBef815ffc1b284c3f412a9e13,0x6DBa7f3A7B5B7c1079337104caD14D19150F6B8d,5400,600),\
(0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,0x22f6A6752800eAB67b84748FeFc3cC658384aF72,0xE20751C7B5867bCBef815ffc1b284c3f412a9e13,0xF64664Ea54cE47eCC7a1816C49d1Bc6deF828927,5400,600)]"

# MentoVenueAdapter(IMentoRouter mentoRouter, address usdm)
cast abi-encode "constructor(address,address)" \
  0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6 0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115

# RateAttestation(address router_)
cast abi-encode "constructor(address)" <router>

# CorridorRouter(address owner_, IRateAttestation attestation_)
cast abi-encode "constructor(address,address)" <owner> <attestation>
```

Verify twice per contract (§14.5): MonadVision reads a separate Sourcify server,
Monadscan is Etherscan V2 and forge derives its URL from `--chain 143` alone.
`ToolchainProbe` has no constructor arguments, so drop the flag for it.

```bash
forge verify-contract --chain 143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args <hex> \
  <address> src/adapters/ChainlinkRateSource.sol:ChainlinkRateSource

forge verify-contract --chain 143 \
  --verifier etherscan --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args <hex> \
  <address> src/adapters/ChainlinkRateSource.sol:ChainlinkRateSource
```

Repeat both for `src/adapters/MentoVenueAdapter.sol:MentoVenueAdapter`,
`src/RateAttestation.sol:RateAttestation` and
`src/CorridorRouter.sol:CorridorRouter`.

## Non-goals this week

No Kuru adapter. No pause. No upgradeability. No fee for Henad. No NGN.
