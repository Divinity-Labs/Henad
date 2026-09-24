// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {DeployClaims} from "../script/DeployClaims.s.sol";
import {HandleRegistry} from "../src/HandleRegistry.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";

/// @notice Unit tests for script/DeployClaims.s.sol's record keeping. forge executes
///         `run()`, file writes included, before it signs or sends anything, so the record
///         the repo keeps has to come from a later step that has seen the contracts on
///         chain. The deploy itself is two `new` calls with nothing to wire.
contract DeployClaimsTest is Test {
    DeployClaims internal script;

    function setUp() public {
        script = new DeployClaims();
    }

    /// Points the run at a chain id no real run uses, one per test because forge runs
    /// tests in parallel and these write real files, and clears whatever an earlier
    /// failed run left there.
    function _useTestChain(uint256 chainId) internal returns (string memory pending, string memory record) {
        vm.chainId(chainId);
        pending = script.deploymentFile(chainId, true, false);
        record = script.recordFile(chainId);
        if (vm.exists(pending)) vm.removeFile(pending);
        if (vm.exists(record)) vm.removeFile(record);
    }

    function _json(address registry, address escrow) internal returns (string memory) {
        vm.serializeAddress("claimsTest", "handleRegistry", registry);
        return vm.serializeAddress("claimsTest", "claimEscrow", escrow);
    }

    /// The broadcast run writes before anything is sent, so it may only ever write the
    /// git-ignored pending file. The record is `confirm()`'s alone.
    function test_deploymentFile_aBroadcastIsOnlyPending() public view {
        assertEq(script.deploymentFile(143, true, false), "./deployments/143.claims.pending.json", "broadcast");
        assertEq(script.deploymentFile(143, false, false), "./deployments/143.claims.dry-run.json", "simulation");
        assertEq(script.deploymentFile(143, true, true), "./deployments/143.claims.local.json", "local broadcast");
        assertEq(script.deploymentFile(143, false, true), "./deployments/143.claims.dry-run.json", "local simulation");
        assertEq(script.recordFile(143), "./deployments/143.claims.json", "the record");
    }

    /// The failed broadcast: one create landed, the other never did.
    function test_requireDeployed_refusesAnAddressWithNoCode() public {
        address registry = address(new HandleRegistry());
        address neverLanded = makeAddr("never landed");

        vm.expectRevert(abi.encodeWithSelector(DeployClaims.NotDeployed.selector, neverLanded));
        script.requireDeployed(registry, neverLanded);
        vm.expectRevert(abi.encodeWithSelector(DeployClaims.NotDeployed.selector, neverLanded));
        script.requireDeployed(neverLanded, address(new ClaimEscrow()));
    }

    /// Code alone is not enough: it has to be the contract the record names.
    function test_requireDeployed_refusesTheWrongContract() public {
        address registry = address(new HandleRegistry());
        address escrow = address(new ClaimEscrow());

        vm.expectRevert(abi.encodeWithSelector(DeployClaims.DomainMismatch.selector, escrow, "Henad Handles"));
        script.requireDeployed(escrow, registry);
        script.requireDeployed(registry, escrow);
    }

    function test_confirm_writesTheRecordOnlyOnceBothAreOnChain() public {
        (string memory pending, string memory record) = _useTestChain(999_143);
        address registry = address(new HandleRegistry());
        address neverLanded = makeAddr("escrow create that never landed");

        vm.writeJson(_json(registry, neverLanded), pending);
        vm.expectRevert(abi.encodeWithSelector(DeployClaims.NotDeployed.selector, neverLanded));
        script.confirm();
        assertFalse(vm.exists(record), "no record for a broadcast that half landed");
        assertTrue(vm.exists(pending), "the pending file stays for the rerun to replace");

        address escrow = address(new ClaimEscrow());
        vm.writeJson(_json(registry, escrow), pending);
        script.confirm();

        assertFalse(vm.exists(pending), "pending file cleared");
        string memory json = vm.readFile(record);
        assertEq(vm.parseJsonAddress(json, ".handleRegistry"), registry);
        assertEq(vm.parseJsonAddress(json, ".claimEscrow"), escrow);
        vm.removeFile(record);
    }

    function test_confirm_withoutABroadcastReverts() public {
        (, string memory record) = _useTestChain(999_144);
        vm.expectRevert();
        script.confirm();
        assertFalse(vm.exists(record));
    }
}
