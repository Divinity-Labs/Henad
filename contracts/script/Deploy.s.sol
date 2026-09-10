// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";

import {CorridorRouter} from "../src/CorridorRouter.sol";
import {RateAttestation} from "../src/RateAttestation.sol";
import {ChainlinkRateSource} from "../src/adapters/ChainlinkRateSource.sol";
import {MentoVenueAdapter} from "../src/adapters/MentoVenueAdapter.sol";
import {IRateSource} from "../src/interfaces/IRateSource.sol";
import {IVenueAdapter} from "../src/interfaces/IVenueAdapter.sol";
import {IMentoRouter} from "../src/interfaces/external/IMentoRouter.sol";
import {AggregatorV3Interface} from "../src/interfaces/external/AggregatorV3Interface.sol";
import {Corridor} from "../src/libraries/Corridor.sol";

// The one verified address table in the repo (docs/INTEGRATION-FACTS.md §1, §2, §4,
// §14). It lives under test/ because that is where it was first needed; duplicating
// it here would create a second source of truth for addresses that must not drift.
import {MonadMainnet as M} from "../test/utils/MonadMainnet.sol";

/// @title Deploy
/// @notice Deploys the Henad settlement stack and registers the five live corridors.
/// @dev Order matters. `RateAttestation` takes the router's address in its constructor
///      and `CorridorRouter` takes the attestation's, so the pair is wired by predicting
///      the router's CREATE address one nonce ahead; neither contract has a setter. The
///      router's own constructor now refuses an attestation that is not already bound to
///      it (`AttestationMisbound`), so a mispredicted nonce fails here rather than at the
///      first payout — the assertions below are belt and braces on top of that.
///
///      Environment:
///        OWNER          corridor registrar and future owner (default: the deployer)
///        PRIVATE_KEY    signing key; omit for a dry run
///        DEPLOYER       address to simulate from when PRIVATE_KEY is unset
///
///      Dry run:
///        forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_MAINNET_RPC_URL
///      Broadcast: add `--broadcast` and set PRIVATE_KEY. See docs/CONTRACTS-SPEC.md,
///      "Deploy and verify", for the verification commands.
contract Deploy is Script {
    /// @notice Chainlink and Mento addresses for one chain.
    struct ChainConfig {
        address ausd;
        address usdc;
        address usdm;
        address gbpm;
        address eurm;
        address chfm;
        address jpym;
        address mentoRouter;
        address clAusdUsd;
        address clUsdcUsd;
        address clGbpUsd;
        address clEurUsd;
        address clChfUsd;
        address clJpyUsd;
    }

    /// @notice One corridor to register, with the ISO-4217 pair its id is derived from.
    struct CorridorSpec {
        address sourceAsset;
        address targetAsset;
        string source;
        string target;
    }

    uint256 internal constant MONAD_MAINNET = 143;
    uint256 internal constant MONAD_TESTNET = 10_143;

    /// @dev Chainlink max ages (docs/INTEGRATION-FACTS.md §14.3): the USD-stable feeds
    ///      have a 3600 s heartbeat, the fiat feeds 240 s.
    uint32 internal constant STABLE_MAX_AGE = 5400;
    uint32 internal constant FX_MAX_AGE = 600;

    /// @dev Placeholder sender for a keyless dry run; override with DEPLOYER.
    address internal constant DEFAULT_DEPLOYER = 0x1111111111111111111111111111111111111111;

    /// @notice No Mento pools and no Chainlink fiat feeds exist on this chain, so a
    ///         corridor registered here could never settle. Monad testnet (10143) is
    ///         the case this is written for: Mento is mainnet-only (§2, §14.1).
    error NoMentoDeployment(uint256 chainId);
    error RouterAddressMismatch(address predicted, address actual);
    error AttestationNotBound(address expected, address actual);
    error CorridorIdMismatch(address sourceAsset, address targetAsset, bytes32 expected, bytes32 actual);
    error CorridorWiringMismatch(address sourceAsset, address targetAsset);

    ChainlinkRateSource public rateSource;
    MentoVenueAdapter public venueAdapter;
    RateAttestation public rateAttestation;
    CorridorRouter public corridorRouter;

    // ---------------------------------------------------------------- config

    /// @notice Addresses for `chainId`, or a revert if the chain has no Mento deployment.
    /// @dev Deliberately a hard revert rather than a partial deployment: running this
    ///      against Monad testnet would otherwise deploy a router with corridors pointing
    ///      at addresses with no code.
    function config(uint256 chainId) public pure returns (ChainConfig memory) {
        if (chainId == MONAD_MAINNET) {
            return ChainConfig({
                ausd: M.AUSD,
                usdc: M.USDC,
                usdm: M.USDM,
                gbpm: M.GBPM,
                eurm: M.EURM,
                chfm: M.CHFM,
                jpym: M.JPYM,
                mentoRouter: M.MENTO_ROUTER,
                clAusdUsd: M.CL_AUSD_USD,
                clUsdcUsd: M.CL_USDC_USD_8,
                clGbpUsd: M.CL_GBP_USD,
                clEurUsd: M.CL_EUR_USD,
                clChfUsd: M.CL_CHF_USD,
                clJpyUsd: M.CL_JPY_USD
            });
        }
        revert NoMentoDeployment(chainId);
    }

    /// @notice The five live corridors, in registration order.
    function corridorSpecs(ChainConfig memory c) public pure returns (CorridorSpec[] memory specs) {
        specs = new CorridorSpec[](5);
        specs[0] = CorridorSpec(c.ausd, c.gbpm, "USD", "GBP");
        specs[1] = CorridorSpec(c.usdc, c.gbpm, "USD", "GBP");
        specs[2] = CorridorSpec(c.ausd, c.eurm, "USD", "EUR");
        specs[3] = CorridorSpec(c.ausd, c.chfm, "USD", "CHF");
        specs[4] = CorridorSpec(c.ausd, c.jpym, "USD", "JPY");
    }

    /// @notice The ChainlinkRateSource constructor argument for this chain.
    function feedPairs(ChainConfig memory c) public pure returns (ChainlinkRateSource.FeedPair[] memory pairs) {
        pairs = new ChainlinkRateSource.FeedPair[](5);
        pairs[0] = _pair(c.ausd, c.gbpm, c.clAusdUsd, c.clGbpUsd);
        pairs[1] = _pair(c.usdc, c.gbpm, c.clUsdcUsd, c.clGbpUsd);
        pairs[2] = _pair(c.ausd, c.eurm, c.clAusdUsd, c.clEurUsd);
        pairs[3] = _pair(c.ausd, c.chfm, c.clAusdUsd, c.clChfUsd);
        pairs[4] = _pair(c.ausd, c.jpym, c.clAusdUsd, c.clJpyUsd);
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

    // ------------------------------------------------------------------- run

    /// @notice Deploy the stack, register the corridors, write the deployment record.
    /// @dev The record is `deployments/<chainId>.json` on a broadcast and
    ///      `deployments/<chainId>.dry-run.json` otherwise (`deploymentFile`).
    /// @return router The CorridorRouter, which is the only address the client needs.
    function run() external returns (CorridorRouter router) {
        ChainConfig memory c = config(block.chainid);
        (address deployer, uint256 pk) = _deployer();
        address owner = vm.envOr("OWNER", deployer);

        console2.log("chain", block.chainid, "block", block.number);
        console2.log("deployer", deployer);
        console2.log("owner   ", owner);

        _deploy(c, deployer, owner, pk);
        bool registered = _registerCorridors(c, owner, pk);
        _writeJson(c, owner, registered);

        return corridorRouter;
    }

    /// @dev PRIVATE_KEY when broadcasting; DEPLOYER (or a placeholder) when simulating.
    function _deployer() internal view returns (address deployer, uint256 pk) {
        pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) return (vm.addr(pk), pk);
        return (vm.envOr("DEPLOYER", DEFAULT_DEPLOYER), 0);
    }

    function _startBroadcast(address deployer, uint256 pk) internal {
        if (pk != 0) {
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast(deployer);
        }
    }

    /// @dev Rate source, venue adapter, then the attestation/router pair. The prediction
    ///      is taken immediately before the attestation deploy so it counts the two
    ///      deployments above it.
    function _deploy(ChainConfig memory c, address deployer, address owner, uint256 pk) internal {
        _startBroadcast(deployer, pk);

        rateSource = new ChainlinkRateSource(feedPairs(c));
        venueAdapter = new MentoVenueAdapter(IMentoRouter(c.mentoRouter), c.usdm);

        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        rateAttestation = new RateAttestation(predicted);
        corridorRouter = new CorridorRouter(owner, rateAttestation);

        vm.stopBroadcast();

        if (address(corridorRouter) != predicted) revert RouterAddressMismatch(predicted, address(corridorRouter));
        if (rateAttestation.router() != address(corridorRouter)) {
            revert AttestationNotBound(address(corridorRouter), rateAttestation.router());
        }

        console2.log("ChainlinkRateSource", address(rateSource));
        console2.log("MentoVenueAdapter  ", address(venueAdapter));
        console2.log("RateAttestation    ", address(rateAttestation));
        console2.log("CorridorRouter     ", address(corridorRouter));
    }

    /// @dev `registerCorridor` is onlyOwner. When the owner is the deployer the script
    ///      registers and verifies every corridor; when it is a multisig the script
    ///      prints the calldata for the owner to submit instead of pretending to.
    /// @return registered True when the corridors were registered by this run; false when
    ///                     the owner is a third party and only the calldata was printed.
    function _registerCorridors(ChainConfig memory c, address owner, uint256 pk) internal returns (bool registered) {
        CorridorSpec[] memory specs = corridorSpecs(c);
        (address deployer,) = _deployer();
        bool ownerIsDeployer = owner == deployer;

        if (ownerIsDeployer) _startBroadcast(deployer, pk);

        for (uint256 i = 0; i < specs.length; ++i) {
            CorridorSpec memory s = specs[i];
            bytes32 id = Corridor.id(s.source, s.target);

            if (ownerIsDeployer) {
                corridorRouter.registerCorridor(s.sourceAsset, s.targetAsset, id, rateSource, venueAdapter);
            } else {
                console2.log("owner must call CorridorRouter.registerCorridor:");
                console2.logBytes(
                    abi.encodeCall(
                        CorridorRouter.registerCorridor,
                        (s.sourceAsset, s.targetAsset, id, IRateSource(rateSource), IVenueAdapter(venueAdapter))
                    )
                );
            }
            console2.log(string.concat("corridor ", s.source, "/", s.target));
            console2.log("  sourceAsset", s.sourceAsset);
            console2.log("  targetAsset", s.targetAsset);
            console2.logBytes32(id);
        }

        if (ownerIsDeployer) {
            vm.stopBroadcast();
            _assertRegistered(specs);
        }
        return ownerIsDeployer;
    }

    /// @dev Read every corridor back and require the stored id, rate source and venue.
    function _assertRegistered(CorridorSpec[] memory specs) internal view {
        for (uint256 i = 0; i < specs.length; ++i) {
            CorridorSpec memory s = specs[i];
            bytes32 expected = Corridor.id(s.source, s.target);
            (bytes32 stored, IRateSource rs, IVenueAdapter venue,,) =
                corridorRouter.corridors(s.sourceAsset, s.targetAsset);
            if (stored != expected) revert CorridorIdMismatch(s.sourceAsset, s.targetAsset, expected, stored);
            if (address(rs) != address(rateSource) || address(venue) != address(venueAdapter)) {
                revert CorridorWiringMismatch(s.sourceAsset, s.targetAsset);
            }
        }
    }

    // ------------------------------------------------------------------ json

    /// @notice True only when this run will actually send transactions.
    /// @dev `forge script` without `--broadcast` still executes `run()` end to end,
    ///      from a simulated sender whose CREATE addresses are fiction. Everything that
    ///      persists outside the EVM must therefore ask this first.
    function isBroadcasting() public view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    /// @notice Path of the deployment record for `chainId`.
    /// @dev Only a real broadcast may write `deployments/<chainId>.json` — that file is
    ///      the deployment record the backend and the verification commands read. A dry
    ///      run writes `<chainId>.dry-run.json` (git-ignored) instead, because its
    ///      addresses come from a simulated sender. Without the split, the dry run that
    ///      docs/CONTRACTS-SPEC.md tells you to run first would silently overwrite a real
    ///      record with simulated addresses.
    /// @param chainId   Chain the record describes.
    /// @param broadcast Whether this run sends transactions; see `isBroadcasting`.
    /// @return path Relative path under `./deployments`.
    function deploymentFile(uint256 chainId, bool broadcast) public pure returns (string memory path) {
        return string.concat("./deployments/", vm.toString(chainId), broadcast ? ".json" : ".dry-run.json");
    }

    /// @dev deployments/<chainId>.json. Needs the `write` fs_permission on ./deployments
    ///      in foundry.toml. `corridorsRegistered` is false when OWNER is a third party
    ///      and this run only printed the calldata: the file must never claim corridors
    ///      that are not on-chain.
    function _writeJson(ChainConfig memory c, address owner, bool corridorsRegistered) internal {
        CorridorSpec[] memory specs = corridorSpecs(c);
        string[] memory entries = new string[](specs.length);
        for (uint256 i = 0; i < specs.length; ++i) {
            string memory key = string.concat("corridor", vm.toString(i));
            vm.serializeString(key, "pair", string.concat(specs[i].source, "/", specs[i].target));
            vm.serializeAddress(key, "sourceAsset", specs[i].sourceAsset);
            vm.serializeAddress(key, "targetAsset", specs[i].targetAsset);
            entries[i] = vm.serializeBytes32(key, "id", Corridor.id(specs[i].source, specs[i].target));
        }

        string memory root = "henad";
        vm.serializeAddress(root, "rateSource", address(rateSource));
        vm.serializeAddress(root, "venueAdapter", address(venueAdapter));
        vm.serializeAddress(root, "rateAttestation", address(rateAttestation));
        vm.serializeAddress(root, "corridorRouter", address(corridorRouter));
        vm.serializeAddress(root, "owner", owner);
        vm.serializeBool(root, "corridorsRegistered", corridorsRegistered);
        vm.serializeUint(root, "deployedAtBlock", block.number);
        string memory json = vm.serializeString(root, "corridors", entries);

        string memory path = deploymentFile(block.chainid, isBroadcasting());
        vm.writeJson(json, path);
        console2.log("wrote", path);
        if (!corridorsRegistered) {
            console2.log("  corridorsRegistered=false: the owner must submit the calldata printed above");
        }
    }
}
