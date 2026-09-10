// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Vm, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ForkTest} from "../utils/ForkTest.sol";
import {MonadMainnet as M} from "../utils/MonadMainnet.sol";
import {CorridorRouter} from "../../src/CorridorRouter.sol";
import {PayoutIntent} from "../../src/PayoutIntent.sol";
import {RateAttestation} from "../../src/RateAttestation.sol";
import {ChainlinkRateSource} from "../../src/adapters/ChainlinkRateSource.sol";
import {MentoVenueAdapter} from "../../src/adapters/MentoVenueAdapter.sol";
import {IRateAttestation} from "../../src/interfaces/IRateAttestation.sol";
import {IRateSource} from "../../src/interfaces/IRateSource.sol";
import {IVenueAdapter} from "../../src/interfaces/IVenueAdapter.sol";
import {IERC3009} from "../../src/interfaces/external/IERC3009.sol";
import {IMentoRouter} from "../../src/interfaces/external/IMentoRouter.sol";
import {IOracleAdapter} from "../../src/interfaces/external/IOracleAdapter.sol";
import {AggregatorV3Interface} from "../../src/interfaces/external/AggregatorV3Interface.sol";
import {Corridor} from "../../src/libraries/Corridor.sol";

// ---------------------------------------------------------------------------
// ERC-4337 v0.8, transcribed from the Sourcify-verified EntryPoint at
// 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108 on chain 143 (docs/INTEGRATION-FACTS.md
// §14.4). Declared here rather than in src/ because nothing we deploy talks to the
// EntryPoint: the router only ever sees `msg.sender == payer`.
// ---------------------------------------------------------------------------

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IEntryPoint {
    event UserOperationEvent(
        bytes32 indexed userOpHash,
        address indexed sender,
        address indexed paymaster,
        uint256 nonce,
        bool success,
        uint256 actualGasCost,
        uint256 actualGasUsed
    );
    event UserOperationRevertReason(
        bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason
    );

    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

interface IPaymaster {
    enum PostOpMode {
        opSucceeded,
        opReverted,
        postOpReverted
    }

    function validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
        external
        returns (bytes memory context, uint256 validationData);
    function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        external;
}

interface ISimple7702Account {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    function executeBatch(Call[] calldata calls) external;
    function entryPoint() external view returns (address);
}

/// @notice Stand-in for Pimlico's SingletonPaymasterV8: sponsors every op and records
///         what the EntryPoint charged. Pimlico's own paymaster needs an off-chain
///         signature over a policy id (§14.4), which a fork test cannot produce; what
///         we are proving here is that the payer never pays, which any sponsor shows.
contract StubPaymaster is IPaymaster {
    address public immutable ep;
    uint256 public validations;
    uint256 public postOps;
    PostOpMode public lastMode;

    error NotEntryPoint(address caller);

    constructor(address entryPoint_) {
        ep = entryPoint_;
    }

    function validatePaymasterUserOp(PackedUserOperation calldata, bytes32, uint256)
        external
        override
        returns (bytes memory context, uint256 validationData)
    {
        if (msg.sender != ep) revert NotEntryPoint(msg.sender);
        ++validations;
        return (abi.encode(uint256(1)), 0); // non-empty context so postOp is called
    }

    function postOp(PostOpMode mode, bytes calldata, uint256, uint256) external override {
        if (msg.sender != ep) revert NotEntryPoint(msg.sender);
        ++postOps;
        lastMode = mode;
    }
}

/// @title SettlementForkTest
/// @notice End-to-end settlement against the real Monad mainnet stack at
///         ForkTest.PINNED_BLOCK: real AUSD and USDC (ERC-3009), the real Mento V3
///         Router and its five FX pools, the real Chainlink proxies, and the real
///         ERC-4337 v0.8 EntryPoint with an EIP-7702 delegated payer.
/// @dev The stack is deployed exactly as script/Deploy.s.sol deploys it, including
///      the CREATE nonce prediction that binds RateAttestation to the router.
///
///      Every expected amount comes from `IMentoRouter.getAmountsOut` read in the same
///      block, never from the adapter or router under test; every expected rate comes
///      from the Chainlink proxies, replayed by round id out of the receipt.
///
///      Env: MONAD_MAINNET_RPC_URL for the pinned fork; MONAD_ARCHIVE_RPC_URL
///      (default https://rpc-mainnet.monadinfra.com) for MonadMainnet.SATURDAY_BLOCK,
///      which is older than the public RPCs' state window.
contract SettlementForkTest is ForkTest {
    // ------------------------------------------------------------- constants

    /// @dev Archive endpoint for blocks past the public RPCs' ~1M-block state window.
    string internal constant ARCHIVE_RPC_DEFAULT = "https://rpc-mainnet.monadinfra.com";

    uint32 internal constant STABLE_MAX_AGE = 5400; // AUSD/USD, USDC/USD (3600 s heartbeat)
    uint32 internal constant FX_MAX_AGE = 600; // GBP/USD, EUR/USD, CHF/USD, JPY/USD (240 s)

    uint256 internal constant AMOUNT_IN = 100e6; // 100 AUSD / 100 USDC (both 6 dec)
    uint16 internal constant TOLERANCE_BPS = 50;
    uint16 internal constant MAX_SPREAD_BPS = 50;

    /// @dev Two-hop Mento fee is 19.99 bps (§14.1); the reference is Chainlink, which
    ///      leads or lags Mento's relay by up to ~10 bps either way (§14.3).
    int256 internal constant SPREAD_LO = 15;
    int256 internal constant SPREAD_HI = 30;

    /// @dev Regression guard for the whole path-A call, not a target. Measured here at
    ///      PINNED_BLOCK: 1,471,301, of which Mento's own two-hop swap is 868,286 (59%),
    ///      the two cold Chainlink proxy hops 122,593, the six-slot receipt plus its id
    ///      push 180,772, AUSD's receiveWithAuthorization 72,032 and the router's own
    ///      work ~185,000. §14.5's 1,254,338 predates two things this number includes:
    ///      the sixth receipt slot (`referenceObservation`, added by §14.3) and the real
    ///      CorridorRouter, which that probe stood in for with a mock. §14.5's own
    ///      recommendation — `ceil(estimate * 1.10)`, floor 1.40M, cap 1.6M — still holds.
    uint256 internal constant PATH_A_GAS_LIMIT = 1_550_000;

    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant CANCEL_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @dev Solady/Circle `InvalidSignature()`; both AUSD and USDC bubble it verbatim.
    bytes4 internal constant INVALID_SIGNATURE = 0x8baa579f;

    IEntryPoint internal constant EP = IEntryPoint(M.ENTRYPOINT_V08);
    IMentoRouter internal constant MENTO = IMentoRouter(M.MENTO_ROUTER);

    bytes32 internal constant USEROP_EVENT_SIG =
        keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)");
    bytes32 internal constant USEROP_REVERT_SIG = keccak256("UserOperationRevertReason(bytes32,address,uint256,bytes)");
    bytes32 internal constant PAYOUT_SETTLED_SIG = keccak256(
        "PayoutSettled(bytes32,bytes32,address,address,address,address,(bytes32,bytes32,uint128,uint128,uint128,uint128,address,int32,uint64,address,uint64))"
    );

    // userOp gas envelope; generous because the EntryPoint caps the inner call itself.
    uint256 internal constant VERIF_GAS = 500_000;
    uint256 internal constant CALL_GAS = 3_000_000;
    uint256 internal constant PM_VERIF_GAS = 200_000;
    uint256 internal constant PM_POSTOP_GAS = 200_000;
    uint256 internal constant PRE_VERIF_GAS = 60_000;
    uint256 internal constant MAX_PRIO = 1 gwei;
    uint256 internal constant MAX_FEE = 300 gwei;

    // ---------------------------------------------------------------- actors

    uint256 internal payerPk = 0xA11CE;
    address internal payer;
    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    address internal bundler = makeAddr("bundler");
    address internal recipient = makeAddr("recipient");

    // ---------------------------------------------------------------- system

    ChainlinkRateSource internal rateSource;
    MentoVenueAdapter internal adapter;
    RateAttestation internal attestation;
    CorridorRouter internal router;
    StubPaymaster internal paymaster;

    bytes32 internal usdGbp;
    bytes32 internal usdEur;
    bytes32 internal usdChf;
    bytes32 internal usdJpy;

    /// @dev What `submit` scrapes out of the EntryPoint's logs.
    struct OpResult {
        bool found;
        bool success;
        uint256 actualGasCost;
        uint256 actualGasUsed;
        address paymaster;
        bool revertReasonEmitted;
        bytes revertReason;
    }

    function setUp() public {
        _forkMainnet();
        payer = vm.addr(payerPk);
        _deployStack();
        _fundPayer();
    }

    // =====================================================================
    // deployment — the exact order script/Deploy.s.sol uses
    // =====================================================================

    function _feedPairs() internal pure returns (ChainlinkRateSource.FeedPair[] memory pairs) {
        pairs = new ChainlinkRateSource.FeedPair[](5);
        pairs[0] = _pair(M.AUSD, M.GBPM, M.CL_AUSD_USD, M.CL_GBP_USD);
        pairs[1] = _pair(M.USDC, M.GBPM, M.CL_USDC_USD_8, M.CL_GBP_USD);
        pairs[2] = _pair(M.AUSD, M.EURM, M.CL_AUSD_USD, M.CL_EUR_USD);
        pairs[3] = _pair(M.AUSD, M.CHFM, M.CL_AUSD_USD, M.CL_CHF_USD);
        pairs[4] = _pair(M.AUSD, M.JPYM, M.CL_AUSD_USD, M.CL_JPY_USD);
    }

    function _pair(address src, address dst, address base, address quote)
        internal
        pure
        returns (ChainlinkRateSource.FeedPair memory)
    {
        return ChainlinkRateSource.FeedPair({
            sourceAsset: src,
            targetAsset: dst,
            base: AggregatorV3Interface(base),
            quote: AggregatorV3Interface(quote),
            baseMaxAge: STABLE_MAX_AGE,
            quoteMaxAge: FX_MAX_AGE
        });
    }

    /// @dev Rate source, venue adapter, then the attestation/router pair wired by CREATE
    ///      nonce prediction, then the five corridors. Mirrors script/Deploy.s.sol.
    function _deployStack() internal {
        usdGbp = Corridor.id("USD", "GBP");
        usdEur = Corridor.id("USD", "EUR");
        usdChf = Corridor.id("USD", "CHF");
        usdJpy = Corridor.id("USD", "JPY");

        rateSource = new ChainlinkRateSource(_feedPairs());
        adapter = new MentoVenueAdapter(MENTO, M.USDM);

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        attestation = new RateAttestation(predicted);
        router = new CorridorRouter(owner, attestation);
        assertEq(address(router), predicted, "CREATE nonce prediction");
        assertEq(attestation.router(), address(router), "attestation bound to router");

        vm.startPrank(owner);
        router.registerCorridor(M.AUSD, M.GBPM, usdGbp, rateSource, adapter);
        router.registerCorridor(M.USDC, M.GBPM, usdGbp, rateSource, adapter);
        router.registerCorridor(M.AUSD, M.EURM, usdEur, rateSource, adapter);
        router.registerCorridor(M.AUSD, M.CHFM, usdChf, rateSource, adapter);
        router.registerCorridor(M.AUSD, M.JPYM, usdJpy, rateSource, adapter);
        vm.stopPrank();
    }

    function _fundPayer() internal {
        _dealAUSD(payer, 10_000e6);
        deal(M.USDC, payer, 10_000e6);
        assertEq(IERC20(M.USDC).balanceOf(payer), 10_000e6, "dealUSDC failed");
        vm.deal(relayer, 1 ether);
    }

    // =====================================================================
    // helpers
    // =====================================================================

    function _forkArchiveAt(uint256 blockNumber) internal returns (bool ok) {
        string memory archive = vm.envOr("MONAD_ARCHIVE_RPC_URL", string(ARCHIVE_RPC_DEFAULT));
        try vm.createSelectFork(archive, blockNumber) returns (uint256 id) {
            forkId = id;
            ok = block.chainid == M.CHAIN_ID;
        } catch {
            ok = false;
        }
    }

    function _routes(address assetIn, address assetOut) internal pure returns (IMentoRouter.Route[] memory r) {
        if (assetIn == M.USDM || assetOut == M.USDM) {
            r = new IMentoRouter.Route[](1);
            r[0] = IMentoRouter.Route(assetIn, assetOut, address(0));
        } else {
            r = new IMentoRouter.Route[](2);
            r[0] = IMentoRouter.Route(assetIn, M.USDM, address(0));
            r[1] = IMentoRouter.Route(M.USDM, assetOut, address(0));
        }
    }

    /// @dev The truth every amount assertion is measured against: Mento's own quote,
    ///      read straight off the Router in the same block, not via our adapter.
    function _mentoQuote(address assetIn, address assetOut, uint256 amountIn) internal view returns (uint256) {
        uint256[] memory amounts = MENTO.getAmountsOut(amountIn, _routes(assetIn, assetOut));
        return amounts[amounts.length - 1];
    }

    function _intentFor(address src, address dst, uint256 amountIn, bytes32 salt)
        internal
        view
        returns (PayoutIntent.Intent memory)
    {
        return PayoutIntent.Intent({
            payer: payer,
            recipient: recipient,
            sourceAsset: src,
            targetAsset: dst,
            sourceAmount: amountIn,
            quotedAmountOut: _mentoQuote(src, dst, amountIn),
            toleranceBps: TOLERANCE_BPS,
            maxSpreadBps: MAX_SPREAD_BPS,
            deadline: uint64(block.timestamp + 1 hours),
            salt: salt
        });
    }

    /// @dev ERC-3009 ReceiveWithAuthorization digest built against the token's real
    ///      on-chain DOMAIN_SEPARATOR, with the intent id as the nonce and validAfter 0.
    function _authDigest(PayoutIntent.Intent memory i, bytes32 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH, i.payer, address(router), i.sourceAmount, uint256(0), uint256(i.deadline), nonce
            )
        );
        return keccak256(abi.encodePacked(hex"1901", IERC3009(i.sourceAsset).DOMAIN_SEPARATOR(), structHash));
    }

    function _signAuth(PayoutIntent.Intent memory i) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerPk, _authDigest(i, router.hashIntent(i)));
        return abi.encodePacked(r, s, v);
    }

    /// @dev The token's EIP-712 domain, rebuilt by hand from the name/version in §14.4.
    function _assertDomain(address token, string memory name, string memory version) internal view {
        bytes32 built = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), uint256(143), token)
        );
        assertEq(IERC3009(token).DOMAIN_SEPARATOR(), built, "token DOMAIN_SEPARATOR != hand-built domain");
    }

    /// @dev The receipt the router must write for `i`, given what Mento will deliver.
    function _expected(PayoutIntent.Intent memory i, bytes32 corridorId, uint256 delivered)
        internal
        view
        returns (IRateAttestation.Attestation memory)
    {
        (uint256 ref,, bytes32 obs) = rateSource.getRate(i.sourceAsset, i.targetAsset);
        uint256 executed = Corridor.executedRate(
            i.sourceAmount,
            IERC20Metadata(i.sourceAsset).decimals(),
            delivered,
            IERC20Metadata(i.targetAsset).decimals()
        );
        return IRateAttestation.Attestation({
            corridor: corridorId,
            referenceObservation: obs,
            referenceRate: uint128(ref),
            executedRate: uint128(executed),
            sourceAmount: uint128(i.sourceAmount),
            deliveredAmount: uint128(delivered),
            rateSource: address(rateSource),
            spreadBps: int32(Corridor.spreadBps(ref, executed)),
            settledAt: uint64(block.timestamp),
            venue: address(adapter),
            settledAtBlock: uint64(block.number)
        });
    }

    /// @dev REPLAY: unpack the receipt's observation into two Chainlink round ids, fetch
    ///      both rounds from the proxies by id, recompose, and require the receipt's
    ///      referenceRate back. This is the property that makes a receipt auditable.
    function _assertReplay(IRateAttestation.Attestation memory a, address baseProxy, address quoteProxy) internal view {
        uint80 roundBase = uint80(uint256(a.referenceObservation) >> 80);
        uint80 roundQuote = uint80(uint256(a.referenceObservation));
        assertEq(uint256(a.referenceObservation) >> 160, 0, "observation upper bits must be zero");

        (uint80 gotBase, int256 answerBase,, uint256 updatedBase,) =
            AggregatorV3Interface(baseProxy).getRoundData(roundBase);
        (uint80 gotQuote, int256 answerQuote,, uint256 updatedQuote,) =
            AggregatorV3Interface(quoteProxy).getRoundData(roundQuote);
        assertEq(gotBase, roundBase, "base round id echoed");
        assertEq(gotQuote, roundQuote, "quote round id echoed");
        assertGt(answerBase, 0, "base answer");
        assertGt(answerQuote, 0, "quote answer");
        assertGt(updatedBase, 0, "base round completed");
        assertGt(updatedQuote, 0, "quote round completed");

        uint256 scaledBase = uint256(answerBase) * 10 ** (18 - AggregatorV3Interface(baseProxy).decimals());
        uint256 scaledQuote = uint256(answerQuote) * 10 ** (18 - AggregatorV3Interface(quoteProxy).decimals());
        assertEq(Math.mulDiv(scaledBase, 1e18, scaledQuote), a.referenceRate, "replay must reproduce referenceRate");
    }

    /// @dev Neither contract has a sweep, so a wei left behind is lost forever.
    function _assertNoDust() internal view {
        address[7] memory tokens = [M.AUSD, M.USDC, M.USDM, M.GBPM, M.EURM, M.CHFM, M.JPYM];
        for (uint256 k = 0; k < tokens.length; ++k) {
            assertEq(IERC20(tokens[k]).balanceOf(address(router)), 0, "router holds a token");
            assertEq(IERC20(tokens[k]).balanceOf(address(adapter)), 0, "adapter holds a token");
        }
    }

    function _logSpread(string memory label, IRateAttestation.Attestation memory a) internal pure {
        console2.log(label);
        console2.log("  referenceRate (1e18)", a.referenceRate);
        console2.log("  executedRate  (1e18)", a.executedRate);
        console2.log("  delivered (base units)", a.deliveredAmount);
        console2.log("  spread (bps)", a.spreadBps);
    }

    /// @dev EIP-7702: delegate the payer's EOA to the canonical Simple7702Account.
    function _delegatePayer() internal {
        Vm.SignedDelegation memory d = vm.signDelegation(M.SIMPLE_7702_ACCOUNT, payerPk);
        assertEq(d.implementation, M.SIMPLE_7702_ACCOUNT);
        vm.attachDelegation(d);
        (bool ok,) = payer.call("");
        assertTrue(ok, "delegation tx failed");
        assertEq(payer.code.length, 23, "delegated code not persisted");
        assertEq(bytes3(payer.code), bytes3(0xef0100), "delegation prefix");
        assertEq(address(bytes20(bytes23(payer.code) << 24)), M.SIMPLE_7702_ACCOUNT, "delegate");
    }

    // =====================================================================
    // path A — relayer submits the payer's ERC-3009 authorization
    // =====================================================================

    /// @dev The full path-A story on the flagship corridor. Everything asserted here is
    ///      measured against Mento's same-block quote and the Chainlink proxies, never
    ///      against the router's own report.
    function testFork_pathA_ausdToGbpm() public {
        _assertDomain(M.AUSD, "Agora Dollar", "1");
        assertEq(
            RECEIVE_TYPEHASH, 0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8, "ERC-3009 typehash"
        );

        uint256 quoted = _mentoQuote(M.AUSD, M.GBPM, AMOUNT_IN);
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("A:AUSD->GBPm"));
        assertEq(i.quotedAmountOut, quoted, "intent carries the same-block getAmountsOut");
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        IRateAttestation.Attestation memory e = _expected(i, usdGbp, quoted);
        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);
        uint256 payerBefore = IERC20(M.AUSD).balanceOf(payer);

        vm.expectEmit(true, true, true, true, address(attestation));
        emit IRateAttestation.PayoutSettled(id, usdGbp, payer, recipient, M.AUSD, M.GBPM, e);
        vm.prank(relayer);
        uint256 delivered = router.settleWithAuthorization(i, sig);

        // amounts: what arrived is exactly what Mento quoted in this block
        assertEq(delivered, quoted, "returned delivered != quote");
        assertEq(IERC20(M.GBPM).balanceOf(recipient) - recipientBefore, quoted, "recipient delta != quote");
        assertEq(payerBefore - IERC20(M.AUSD).balanceOf(payer), AMOUNT_IN, "payer debited exactly sourceAmount");

        // receipt
        IRateAttestation.Attestation memory a = attestation.get(id);
        assertEq(a.corridor, usdGbp, "corridor id");
        assertEq(a.rateSource, address(rateSource), "rateSource");
        assertEq(a.venue, address(adapter), "venue");
        assertEq(a.deliveredAmount, quoted, "receipt deliveredAmount");
        assertEq(a.sourceAmount, AMOUNT_IN, "receipt sourceAmount");
        assertEq(attestation.count(), 1);
        _assertReplay(a, M.CL_AUSD_USD, M.CL_GBP_USD);

        // disclosed spread
        _logSpread("path A AUSD->GBPm", a);
        assertGe(int256(a.spreadBps), SPREAD_LO, "spread below band");
        assertLe(int256(a.spreadBps), SPREAD_HI, "spread above band");

        // lifecycle and hygiene
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.Filled), "intent Filled");
        assertTrue(IERC3009(M.AUSD).authorizationState(payer, id), "AUSD nonce = intentId consumed");
        _assertNoDust();
    }

    /// @dev Replay of a spent authorization is refused by the router's own pre-check,
    ///      before it touches the token.
    function testFork_pathA_replayRevertsAuthorizationUsed() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("A:replay"));
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        vm.prank(relayer);
        router.settleWithAuthorization(i, sig);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(CorridorRouter.AuthorizationUsed.selector, id));
        router.settleWithAuthorization(i, sig);
    }

    /// @dev nonce = intentId, so changing one intent field changes the nonce and the
    ///      payer's signature no longer recovers: the token rejects it, not the router.
    function testFork_pathA_tamperedIntentRevertsAtToken() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("A:tamper"));
        bytes32 signedId = router.hashIntent(i);
        bytes memory sig = _signAuth(i); // signs the authorization whose nonce is signedId

        // Tamper in place (a memory struct assignment would alias, not copy).
        address attacker = makeAddr("attacker");
        i.recipient = attacker;
        assertTrue(router.hashIntent(i) != signedId, "tampering must change the id");

        uint256 payerBefore = IERC20(M.AUSD).balanceOf(payer);
        vm.prank(relayer);
        (bool ok, bytes memory err) =
            address(router).call(abi.encodeCall(CorridorRouter.settleWithAuthorization, (i, sig)));
        assertFalse(ok, "tampered intent must revert");
        assertEq(bytes4(err), INVALID_SIGNATURE, "AUSD must reject with InvalidSignature() 0x8baa579f");
        assertEq(IERC20(M.AUSD).balanceOf(payer), payerBefore, "nothing moved");
        assertEq(IERC20(M.GBPM).balanceOf(attacker), 0, "attacker received nothing");
        assertFalse(IERC3009(M.AUSD).authorizationState(payer, signedId), "the signed nonce is still unspent");
    }

    /// @dev A payer with no gas cancels at the token instead of on the router; the
    ///      router's pre-check then reports it as AuthorizationUsed.
    function testFork_pathA_cancelledAuthorizationReverts() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("A:cancel"));
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            payerPk,
            keccak256(
                abi.encodePacked(
                    hex"1901", IERC3009(M.AUSD).DOMAIN_SEPARATOR(), keccak256(abi.encode(CANCEL_TYPEHASH, payer, id))
                )
            )
        );
        vm.prank(makeAddr("anyone"));
        IERC3009(M.AUSD).cancelAuthorization(payer, id, abi.encodePacked(r, s, v));
        assertTrue(IERC3009(M.AUSD).authorizationState(payer, id), "cancel marks the nonce used");

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(CorridorRouter.AuthorizationUsed.selector, id));
        router.settleWithAuthorization(i, sig);
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.None), "intent untouched");
    }

    /// @dev The second source asset, with Circle's own EIP-712 domain.
    function testFork_pathA_usdcToGbpm() public {
        _assertDomain(M.USDC, "USDC", "2");

        uint256 quoted = _mentoQuote(M.USDC, M.GBPM, AMOUNT_IN);
        PayoutIntent.Intent memory i = _intentFor(M.USDC, M.GBPM, AMOUNT_IN, keccak256("A:USDC->GBPm"));
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);
        vm.prank(relayer);
        uint256 delivered = router.settleWithAuthorization(i, sig);

        assertEq(delivered, quoted, "delivered != same-block quote");
        assertEq(IERC20(M.GBPM).balanceOf(recipient) - recipientBefore, quoted, "recipient delta");

        IRateAttestation.Attestation memory a = attestation.get(id);
        assertEq(a.corridor, usdGbp);
        assertEq(a.rateSource, address(rateSource));
        assertEq(a.venue, address(adapter));
        _assertReplay(a, M.CL_USDC_USD_8, M.CL_GBP_USD);
        _logSpread("path A USDC->GBPm", a);
        assertGe(int256(a.spreadBps), SPREAD_LO);
        assertLe(int256(a.spreadBps), SPREAD_HI);
        assertTrue(IERC3009(M.USDC).authorizationState(payer, id), "USDC nonce consumed");
        _assertNoDust();
    }

    /// @dev A payer who has used path B once keeps a 23-byte 7702 delegation forever.
    ///      AUSD (Solady: ecrecover first) still accepts the raw signature.
    function testFork_pathA_delegatedPayer_ausd() public {
        _delegatePayer();
        _pathAWithDelegatedPayer(M.AUSD, M.CL_AUSD_USD, keccak256("A:7702:AUSD"));
    }

    /// @dev USDC (Circle: ERC-1271 whenever the signer has code) routes the same
    ///      signature through Simple7702Account.isValidSignature instead.
    function testFork_pathA_delegatedPayer_usdc() public {
        _delegatePayer();
        _pathAWithDelegatedPayer(M.USDC, M.CL_USDC_USD_8, keccak256("A:7702:USDC"));
    }

    function _pathAWithDelegatedPayer(address token, address baseProxy, bytes32 salt) internal {
        uint256 quoted = _mentoQuote(token, M.GBPM, AMOUNT_IN);
        PayoutIntent.Intent memory i = _intentFor(token, M.GBPM, AMOUNT_IN, salt);
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);
        vm.prank(relayer);
        uint256 delivered = router.settleWithAuthorization(i, sig);

        assertEq(delivered, quoted, "delivered != same-block quote");
        assertEq(IERC20(M.GBPM).balanceOf(recipient) - recipientBefore, quoted, "recipient delta");
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.Filled));
        assertTrue(IERC3009(token).authorizationState(payer, id));
        _assertReplay(attestation.get(id), baseProxy, M.CL_GBP_USD);
        _assertNoDust();
    }

    // =====================================================================
    // path B — real EntryPoint v0.8, sponsored, 7702-delegated payer
    // =====================================================================

    function _pack(uint256 hi, uint256 lo) internal pure returns (bytes32) {
        return bytes32((hi << 128) | lo);
    }

    function _buildOp(bytes memory callData) internal view returns (PackedUserOperation memory op) {
        op = PackedUserOperation({
            sender: payer,
            nonce: EP.getNonce(payer, 0),
            initCode: "",
            callData: callData,
            accountGasLimits: _pack(VERIF_GAS, CALL_GAS),
            preVerificationGas: PRE_VERIF_GAS,
            gasFees: _pack(MAX_PRIO, MAX_FEE),
            paymasterAndData: abi.encodePacked(address(paymaster), uint128(PM_VERIF_GAS), uint128(PM_POSTOP_GAS)),
            signature: ""
        });
    }

    /// @dev The sponsored batch the backend will ask Pimlico to sponsor: approve the
    ///      router for exactly `sourceAmount`, then settle. Both run as the payer's EOA.
    function _settleBatch(PayoutIntent.Intent memory i) internal view returns (bytes memory) {
        ISimple7702Account.Call[] memory calls = new ISimple7702Account.Call[](2);
        calls[0] = ISimple7702Account.Call({
            target: i.sourceAsset, value: 0, data: abi.encodeCall(IERC20.approve, (address(router), i.sourceAmount))
        });
        calls[1] = ISimple7702Account.Call({
            target: address(router), value: 0, data: abi.encodeCall(CorridorRouter.settle, (i))
        });
        return abi.encodeCall(ISimple7702Account.executeBatch, (calls));
    }

    /// @dev One bundle, one op, submitted by a real bundler EOA. Returns both the
    ///      scraped EntryPoint result and every log the transaction emitted.
    function _submit(PackedUserOperation memory op) internal returns (OpResult memory res, Vm.Log[] memory logs) {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.recordLogs();
        vm.prank(bundler, bundler);
        EP.handleOps(ops, payable(bundler));
        logs = vm.getRecordedLogs();
        res = _scrape(logs);
    }

    /// @dev Scrape the payer out of the PayoutSettled log the attestation emitted; it is
    ///      the third indexed field. Proves the router saw `msg.sender == payer` rather
    ///      than the EntryPoint or the delegate.
    function _settledPayer(Vm.Log[] memory logs) internal view returns (bool found, address settledPayer) {
        for (uint256 k = 0; k < logs.length; ++k) {
            if (logs[k].emitter == address(attestation) && logs[k].topics[0] == PAYOUT_SETTLED_SIG) {
                return (true, address(uint160(uint256(logs[k].topics[3]))));
            }
        }
    }

    function _preparePathB() internal {
        _delegatePayer();
        paymaster = new StubPaymaster(address(EP));
        vm.deal(address(this), 100 ether);
        EP.depositTo{value: 5 ether}(address(paymaster));
        vm.deal(bundler, 10 ether);
        vm.deal(payer, 0); // the payer never pays for gas, so it never needs any
        assertEq(ISimple7702Account(payer).entryPoint(), address(EP), "delegate points at EntryPoint v0.8");
    }

    function testFork_pathB_handleOps() public {
        _preparePathB();

        uint256 quoted = _mentoQuote(M.AUSD, M.GBPM, AMOUNT_IN);
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("B:AUSD->GBPm"));
        bytes32 id = router.hashIntent(i);

        PackedUserOperation memory op = _buildOp(_settleBatch(i));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerPk, EP.getUserOpHash(op));
        op.signature = abi.encodePacked(r, s, v);

        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);
        uint256 payerAusdBefore = IERC20(M.AUSD).balanceOf(payer);

        (OpResult memory res, Vm.Log[] memory logs) = _submit(op);
        assertTrue(res.found, "UserOperationEvent emitted");
        if (res.revertReasonEmitted) console2.logBytes(res.revertReason);
        assertTrue(res.success, "UserOperationEvent.success");
        assertEq(res.paymaster, address(paymaster), "sponsored by the paymaster");

        // the router saw the EOA, not the EntryPoint or the delegate
        (bool foundReceiptLog, address settledPayer) = _settledPayer(logs);
        assertTrue(foundReceiptLog, "PayoutSettled emitted");
        assertEq(settledPayer, payer, "receipt payer == the delegated EOA");

        assertEq(IERC20(M.GBPM).balanceOf(recipient) - recipientBefore, quoted, "recipient delta != same-block quote");
        assertEq(payerAusdBefore - IERC20(M.AUSD).balanceOf(payer), AMOUNT_IN, "payer debited");
        assertEq(IERC20(M.AUSD).allowance(payer, address(router)), 0, "allowance fully consumed");
        assertEq(payer.balance, 0, "payer MON must stay 0");
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.Filled), "intent Filled");

        IRateAttestation.Attestation memory a = attestation.get(id);
        assertEq(a.deliveredAmount, quoted);
        assertEq(a.venue, address(adapter));
        assertEq(a.rateSource, address(rateSource));
        _assertReplay(a, M.CL_AUSD_USD, M.CL_GBP_USD);
        _logSpread("path B AUSD->GBPm", a);
        _assertNoDust();

        console2.log("gas: path B handleOps actualGasUsed", res.actualGasUsed);
        console2.log("gas: path B actualGasCost (wei)", res.actualGasCost);
    }

    /// @dev The failure mode the backend must handle: the inner call reverts, the bundle
    ///      does not. `handleOps` succeeds, the op is marked failed, the paymaster still
    ///      pays, and nothing about the payout happened. Parse PayoutSettled, never the
    ///      transaction status (§14.4).
    function testFork_pathB_softFailure_spreadTooWide() public {
        _preparePathB();

        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("B:soft-fail"));
        i.maxSpreadBps = 1; // the real two-hop fee alone is ~20 bps
        bytes32 id = router.hashIntent(i);

        PackedUserOperation memory op = _buildOp(_settleBatch(i));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerPk, EP.getUserOpHash(op));
        op.signature = abi.encodePacked(r, s, v);

        uint256 payerAusdBefore = IERC20(M.AUSD).balanceOf(payer);
        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);
        uint256 pmDepositBefore = EP.balanceOf(address(paymaster));

        (OpResult memory res,) = _submit(op); // handleOps itself must not revert

        assertTrue(res.found, "UserOperationEvent emitted");
        assertFalse(res.success, "UserOperationEvent.success must be false");
        assertTrue(res.revertReasonEmitted, "UserOperationRevertReason emitted");
        _assertInnerRevertIsSpreadTooWide(res.revertReason);

        assertEq(attestation.get(id).settledAt, 0, "no receipt written");
        assertEq(attestation.count(), 0, "receipt ledger untouched");
        assertEq(uint8(router.intentStatus(id)), uint8(PayoutIntent.Status.None), "intent still None");
        assertEq(IERC20(M.AUSD).balanceOf(payer), payerAusdBefore, "payer AUSD unchanged");
        assertEq(IERC20(M.AUSD).allowance(payer, address(router)), 0, "approve rolled back with the batch");
        assertEq(IERC20(M.GBPM).balanceOf(recipient), recipientBefore, "recipient unchanged");
        assertEq(payer.balance, 0, "payer MON must stay 0");
        assertGt(pmDepositBefore - EP.balanceOf(address(paymaster)), 0, "paymaster still charged");
        assertEq(uint8(paymaster.lastMode()), uint8(IPaymaster.PostOpMode.opReverted), "postOp saw opReverted");
        _assertNoDust();
    }

    /// @dev Simple7702Account wraps an inner failure as `ExecuteError(index, inner)`.
    function _assertInnerRevertIsSpreadTooWide(bytes memory revertReason) internal pure {
        assertEq(bytes4(revertReason), bytes4(keccak256("ExecuteError(uint256,bytes)")), "ExecuteError wrapper");
        bytes memory tail = new bytes(revertReason.length - 4);
        for (uint256 k = 0; k < tail.length; ++k) {
            tail[k] = revertReason[k + 4];
        }
        (uint256 index, bytes memory inner) = abi.decode(tail, (uint256, bytes));
        assertEq(index, 1, "the settle call is call 1 of the batch");
        assertEq(bytes4(inner), CorridorRouter.SpreadTooWide.selector, "inner revert is SpreadTooWide");
    }

    function _scrape(Vm.Log[] memory logs) internal view returns (OpResult memory res) {
        for (uint256 k = 0; k < logs.length; ++k) {
            if (logs[k].emitter != address(EP)) continue;
            if (logs[k].topics[0] == USEROP_EVENT_SIG) {
                res.found = true;
                res.paymaster = address(uint160(uint256(logs[k].topics[3])));
                (, res.success, res.actualGasCost, res.actualGasUsed) =
                    abi.decode(logs[k].data, (uint256, bool, uint256, uint256));
                assertEq(address(uint160(uint256(logs[k].topics[2]))), payer, "UserOperationEvent.sender");
            } else if (logs[k].topics[0] == USEROP_REVERT_SIG) {
                res.revertReasonEmitted = true;
                (, res.revertReason) = abi.decode(logs[k].data, (uint256, bytes));
            }
        }
    }

    // =====================================================================
    // the other three corridors
    // =====================================================================

    function testFork_pathA_ausdToEurm() public {
        _corridor(M.EURM, usdEur, M.CL_EUR_USD, "path A AUSD->EURm");
    }

    function testFork_pathA_ausdToChfm() public {
        _corridor(M.CHFM, usdChf, M.CL_CHF_USD, "path A AUSD->CHFm");
    }

    function testFork_pathA_ausdToJpym() public {
        _corridor(M.JPYM, usdJpy, M.CL_JPY_USD, "path A AUSD->JPYm");
    }

    function _corridor(address target, bytes32 corridorId, address quoteProxy, string memory label) internal {
        uint256 quoted = _mentoQuote(M.AUSD, target, AMOUNT_IN);
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, target, AMOUNT_IN, keccak256(bytes(label)));
        bytes32 id = router.hashIntent(i);
        bytes memory sig = _signAuth(i);

        uint256 recipientBefore = IERC20(target).balanceOf(recipient);
        vm.prank(relayer);
        uint256 delivered = router.settleWithAuthorization(i, sig);

        assertEq(delivered, quoted, "delivered != same-block quote");
        assertEq(IERC20(target).balanceOf(recipient) - recipientBefore, quoted, "recipient delta != quote");

        IRateAttestation.Attestation memory a = attestation.get(id);
        assertEq(a.corridor, corridorId, "corridor id");
        assertEq(a.rateSource, address(rateSource));
        assertEq(a.venue, address(adapter));
        _assertReplay(a, M.CL_AUSD_USD, quoteProxy);
        _logSpread(label, a);
        assertGe(int256(a.spreadBps), SPREAD_LO, "spread below band");
        assertLe(int256(a.spreadBps), SPREAD_HI, "spread above band");
        _assertNoDust();
    }

    // =====================================================================
    // limits
    // =====================================================================

    /// @dev The disclosure limit. A 5 bps ceiling cannot survive Mento's own 20 bps of
    ///      fees, and the whole swap rolls back with it.
    function testFork_limits_spreadTooWideRollsBack() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("limits:spread"));
        i.maxSpreadBps = 5;
        bytes memory sig = _signAuth(i);

        IRateAttestation.Attestation memory e = _expected(i, usdGbp, i.quotedAmountOut);
        assertGt(int256(e.spreadBps), 5, "the real spread must exceed the limit for this test to mean anything");

        uint256 payerBefore = IERC20(M.AUSD).balanceOf(payer);
        uint256 recipientBefore = IERC20(M.GBPM).balanceOf(recipient);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(CorridorRouter.SpreadTooWide.selector, int256(e.spreadBps), uint16(5)));
        router.settleWithAuthorization(i, sig);

        assertEq(IERC20(M.AUSD).balanceOf(payer), payerBefore, "payer AUSD unchanged");
        assertEq(IERC20(M.GBPM).balanceOf(recipient), recipientBefore, "recipient unchanged");
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));
        _assertNoDust();
    }

    /// @dev minAmountOut comes from the payer-signed quote and tolerance only. One wei
    ///      above what the venue will deliver and Mento itself refuses.
    function testFork_limits_minOutAboveQuoteRevertsAtMento() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("limits:minout"));
        i.quotedAmountOut = _mentoQuote(M.AUSD, M.GBPM, AMOUNT_IN) + 1;
        i.toleranceBps = 0;
        assertEq(router.minAmountOut(i), i.quotedAmountOut, "tolerance 0 => minOut == quote");
        bytes memory sig = _signAuth(i);

        uint256 payerBefore = IERC20(M.AUSD).balanceOf(payer);
        vm.prank(relayer);
        vm.expectRevert(IMentoRouter.InsufficientOutputAmount.selector);
        router.settleWithAuthorization(i, sig);

        assertEq(IERC20(M.AUSD).balanceOf(payer), payerBefore, "payer AUSD unchanged");
        assertEq(IERC20(M.GBPM).balanceOf(recipient), 0, "recipient unchanged");
    }

    /// @dev The reference is read before the swap precisely so a stale feed costs
    ///      nothing. Two hours with no new Chainlink round blows past the 5400 s bound
    ///      on AUSD/USD (checked first) and the 600 s bound on GBP/USD.
    function testFork_limits_staleReferenceRevertsBeforeAnyTokenMoves() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("limits:stale"));
        i.deadline = uint64(block.timestamp + 1 days); // survive the warp; validBefore tracks it
        bytes memory sig = _signAuth(i);

        (,,, uint256 updatedAtBase,) = AggregatorV3Interface(M.CL_AUSD_USD).latestRoundData();
        vm.warp(block.timestamp + 2 hours);
        assertGt(block.timestamp - updatedAtBase, STABLE_MAX_AGE, "AUSD/USD must be stale after the warp");

        uint256 payerBefore = IERC20(M.AUSD).balanceOf(payer);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRateSource.StaleReferenceRate.selector, M.CL_AUSD_USD, updatedAtBase, uint256(STABLE_MAX_AGE)
            )
        );
        router.settleWithAuthorization(i, sig);

        assertEq(IERC20(M.AUSD).balanceOf(payer), payerBefore, "payer AUSD unchanged");
        assertEq(IERC20(M.GBPM).balanceOf(recipient), 0, "recipient unchanged");
        assertFalse(IERC3009(M.AUSD).authorizationState(payer, router.hashIntent(i)), "nonce not spent");
        _assertNoDust();
    }

    /// @dev The relayer and client pre-flight: never reverts, and at a normal block it
    ///      reports a tradable corridor with both numbers populated.
    function testFork_limits_previewQuoteOpen() public view {
        (uint256 quotedOut, uint256 referenceRate, IVenueAdapter.Status status) =
            router.previewQuote(M.AUSD, M.GBPM, AMOUNT_IN);
        assertEq(uint8(status), uint8(IVenueAdapter.Status.Open), "status");
        assertGt(referenceRate, 0, "reference rate");
        assertEq(quotedOut, _mentoQuote(M.AUSD, M.GBPM, AMOUNT_IN), "quote != same-block getAmountsOut");
        console2.log("previewQuote: quotedOut", quotedOut, "referenceRate", referenceRate);
    }

    // =====================================================================
    // weekend: Mento's market-hours breaker
    // =====================================================================

    /// @dev At a real Saturday block the GBPm pool's oracle adapter is closed, so the
    ///      swap reverts `FXMarketClosed` and it bubbles through the adapter and router
    ///      unchanged, while previewQuote reports MarketClosed without reverting.
    function testFork_saturday_marketClosedBubbles() public {
        if (!_forkArchiveAt(M.SATURDAY_BLOCK)) {
            console2.log("no endpoint served SATURDAY_BLOCK; skipping");
            vm.skip(true);
        }
        _deployStack();
        _fundPayer();

        (uint256 quotedOut, uint256 referenceRate, IVenueAdapter.Status status) =
            router.previewQuote(M.AUSD, M.GBPM, AMOUNT_IN);
        assertEq(uint8(status), uint8(IVenueAdapter.Status.MarketClosed), "previewQuote status");
        assertEq(quotedOut, 0, "the venue cannot price a closed market");
        assertGt(referenceRate, 0, "Chainlink keeps posting GBP/USD all weekend");

        // Build the intent by hand: _intentFor would call getAmountsOut, which reverts.
        PayoutIntent.Intent memory i = PayoutIntent.Intent({
            payer: payer,
            recipient: recipient,
            sourceAsset: M.AUSD,
            targetAsset: M.GBPM,
            sourceAmount: AMOUNT_IN,
            quotedAmountOut: 73e18,
            toleranceBps: TOLERANCE_BPS,
            maxSpreadBps: MAX_SPREAD_BPS,
            deadline: uint64(block.timestamp + 1 hours),
            salt: keccak256("saturday")
        });
        bytes memory sig = _signAuth(i);

        vm.prank(relayer);
        vm.expectRevert(IOracleAdapter.FXMarketClosed.selector);
        router.settleWithAuthorization(i, sig);

        assertEq(IERC20(M.GBPM).balanceOf(recipient), 0, "nothing delivered");
        assertEq(uint8(router.intentStatus(router.hashIntent(i))), uint8(PayoutIntent.Status.None));

        // The USD-stable pools use a breaker with checks disabled, so they stay open.
        assertEq(
            uint8(adapter.status(M.AUSD, M.USDM)), uint8(IVenueAdapter.Status.Open), "AUSD/USDm open on a Saturday"
        );
    }

    // =====================================================================
    // gas
    // =====================================================================

    /// @dev Monad bills the gas limit, not the usage (§14.5), so this number is what the
    ///      relayer's limit is derived from. Measured on a cold fork: nothing in the
    ///      router's storage or the pools' pages is warm.
    function testFork_gas_pathA() public {
        PayoutIntent.Intent memory i = _intentFor(M.AUSD, M.GBPM, AMOUNT_IN, keccak256("gas:A"));
        bytes memory sig = _signAuth(i);

        vm.prank(relayer);
        uint256 before = gasleft();
        router.settleWithAuthorization(i, sig);
        uint256 used = before - gasleft();

        console2.log("gas: path A settleWithAuthorization (real AUSD, Mento two-hop, cold):", used);
        assertLt(used, PATH_A_GAS_LIMIT, "path A gas regressed past the 1.55M guard");
    }
}
