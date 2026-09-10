// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {ChainlinkRateSource} from "../src/adapters/ChainlinkRateSource.sol";
import {Corridor} from "../src/libraries/Corridor.sol";
import {MonadMainnet as M} from "./utils/MonadMainnet.sol";

/// @notice Unit tests for the pure half of script/Deploy.s.sol: the per-chain address
///         table, the corridor list and the feed wiring. The deploy sequence itself is
///         exercised by test/fork/Settlement.fork.t.sol, whose setUp performs exactly
///         the same steps in the same order, and by the dry run against mainnet.
contract DeployTest is Test {
    Deploy internal script;

    function setUp() public {
        script = new Deploy();
    }

    /// Mento is mainnet-only: there are no USDm/GBPm pools and no Chainlink fiat feeds
    /// on Monad testnet, so the script must refuse rather than deploy a router whose
    /// corridors point at addresses with no code.
    function test_config_refusesMonadTestnet() public {
        vm.expectRevert(abi.encodeWithSelector(Deploy.NoMentoDeployment.selector, uint256(10_143)));
        script.config(10_143);
    }

    function test_config_refusesEveryOtherChain() public {
        uint256[4] memory chains = [uint256(1), 8453, 137, 31_337];
        for (uint256 i = 0; i < chains.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(Deploy.NoMentoDeployment.selector, chains[i]));
            script.config(chains[i]);
        }
    }

    function test_config_monadMainnet() public view {
        Deploy.ChainConfig memory c = script.config(143);
        assertEq(c.ausd, M.AUSD);
        assertEq(c.usdc, M.USDC);
        assertEq(c.usdm, M.USDM);
        assertEq(c.gbpm, M.GBPM);
        assertEq(c.eurm, M.EURM);
        assertEq(c.chfm, M.CHFM);
        assertEq(c.jpym, M.JPYM);
        assertEq(c.mentoRouter, M.MENTO_ROUTER);
        assertEq(c.clAusdUsd, M.CL_AUSD_USD);
        assertEq(c.clUsdcUsd, M.CL_USDC_USD_8, "the 8-dec USDC/USD proxy Mento relays, not the SVR one");
        assertEq(c.clGbpUsd, M.CL_GBP_USD);
        assertEq(c.clEurUsd, M.CL_EUR_USD);
        assertEq(c.clChfUsd, M.CL_CHF_USD);
        assertEq(c.clJpyUsd, M.CL_JPY_USD);
    }

    /// The five live corridors, with the ids the receipts will carry.
    function test_corridorSpecs() public view {
        Deploy.CorridorSpec[] memory specs = script.corridorSpecs(script.config(143));
        assertEq(specs.length, 5);

        assertEq(specs[0].sourceAsset, M.AUSD);
        assertEq(specs[0].targetAsset, M.GBPM);
        assertEq(Corridor.id(specs[0].source, specs[0].target), Corridor.id("USD", "GBP"));

        assertEq(specs[1].sourceAsset, M.USDC);
        assertEq(specs[1].targetAsset, M.GBPM);
        assertEq(Corridor.id(specs[1].source, specs[1].target), Corridor.id("USD", "GBP"));

        assertEq(specs[2].targetAsset, M.EURM);
        assertEq(Corridor.id(specs[2].source, specs[2].target), Corridor.id("USD", "EUR"));

        assertEq(specs[3].targetAsset, M.CHFM);
        assertEq(Corridor.id(specs[3].source, specs[3].target), Corridor.id("USD", "CHF"));

        assertEq(specs[4].targetAsset, M.JPYM);
        assertEq(Corridor.id(specs[4].source, specs[4].target), Corridor.id("USD", "JPY"));

        // Corridor.id is the ISO-4217 pair, not the token pair: AUSD and USDC share one.
        assertEq(Corridor.id("USD", "GBP"), keccak256("USD/GBP"));
    }

    // ---------------------------------------------------------- deployment record

    /// The deployment record is the file the backend and the verification commands read.
    /// A simulated run's addresses come from a simulated sender, so it must never land on
    /// the canonical name: `forge script` without `--broadcast` still runs `run()` to
    /// completion, and the dry run is the first command in the deploy runbook, so without
    /// the split it would overwrite a real record with fiction on every rehearsal.
    function test_deploymentFile_onlyABroadcastWritesTheCanonicalRecord() public view {
        assertEq(script.deploymentFile(143, true), "./deployments/143.json", "broadcast");
        assertEq(script.deploymentFile(143, false), "./deployments/143.dry-run.json", "simulation");
        assertEq(script.deploymentFile(10_143, true), "./deployments/10143.json", "chain id is not hardcoded");
    }

    /// The guard that picks between them. Any context that is not a broadcast — this test,
    /// a keyless `forge script`, coverage — must read as "not broadcasting".
    function test_isBroadcasting_falseOutsideABroadcast() public view {
        assertFalse(script.isBroadcasting(), "forge test is not a broadcast context");
    }

    /// Every corridor gets a feed pair, with the USD-stable leg as base and the fiat leg
    /// as quote, and the max ages from docs/INTEGRATION-FACTS.md §14.3.
    function test_feedPairs() public view {
        ChainlinkRateSource.FeedPair[] memory pairs = script.feedPairs(script.config(143));
        Deploy.CorridorSpec[] memory specs = script.corridorSpecs(script.config(143));
        assertEq(pairs.length, specs.length, "one feed pair per corridor");

        address[5] memory expectedQuote = [M.CL_GBP_USD, M.CL_GBP_USD, M.CL_EUR_USD, M.CL_CHF_USD, M.CL_JPY_USD];
        address[5] memory expectedBase = [M.CL_AUSD_USD, M.CL_USDC_USD_8, M.CL_AUSD_USD, M.CL_AUSD_USD, M.CL_AUSD_USD];

        for (uint256 i = 0; i < pairs.length; ++i) {
            assertEq(pairs[i].sourceAsset, specs[i].sourceAsset, "feed pair source matches corridor");
            assertEq(pairs[i].targetAsset, specs[i].targetAsset, "feed pair target matches corridor");
            assertEq(address(pairs[i].base), expectedBase[i], "base feed");
            assertEq(address(pairs[i].quote), expectedQuote[i], "quote feed");
            assertEq(pairs[i].baseMaxAge, 5400, "USD-stable max age");
            assertEq(pairs[i].quoteMaxAge, 600, "fiat max age");
        }
    }
}
