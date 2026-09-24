// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC5267} from "@openzeppelin/contracts/interfaces/IERC5267.sol";

import {HandleRegistry} from "../src/HandleRegistry.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {Deploy} from "./Deploy.s.sol";

/// @title DeployClaims
/// @notice Deploys the two contracts behind paying a person rather than an address:
///         HandleRegistry (pay a handle such as "ada") and ClaimEscrow (pay, by link, someone
///         who has no account yet).
/// @dev Neither contract takes a constructor argument, has an owner, or refers to the other
///      or to the settlement stack, so there is nothing to wire and the order does not
///      matter. Both work on any chain, so unlike Deploy nothing here refuses testnet.
///
///      Environment, as for Deploy:
///        PRIVATE_KEY    signing key; leave unset for a dry run or when signing with --account
///        DEPLOYER       address to broadcast from when PRIVATE_KEY is unset
///
///      Dry run, which also prints the gas it would cost:
///        DEPLOYER=<address> forge script script/DeployClaims.s.sol:DeployClaims --rpc-url $MONAD_MAINNET_RPC_URL
///      Broadcast from a Foundry keystore (asks for its password):
///        DEPLOYER=<address> forge script script/DeployClaims.s.sol:DeployClaims \
///          --rpc-url $MONAD_MAINNET_RPC_URL --account <keystore name> --sender <address> --broadcast
///      Then, once both transactions have landed, confirm; this sends nothing:
///        forge script script/DeployClaims.s.sol:DeployClaims --sig "confirm()" --rpc-url $MONAD_MAINNET_RPC_URL
///
///      Verify each contract twice, as for the settlement stack (docs/CONTRACTS-SPEC.md,
///      "Deploy and verify"); neither has constructor arguments:
///        forge verify-contract --chain 143 --verifier sourcify \
///          --verifier-url https://sourcify-api-monad.blockvision.org/ <address> src/ClaimEscrow.sol:ClaimEscrow
///        forge verify-contract --chain 143 --verifier etherscan \
///          --etherscan-api-key $ETHERSCAN_API_KEY <address> src/ClaimEscrow.sol:ClaimEscrow
///      and the same for src/HandleRegistry.sol:HandleRegistry.
///
///      The record is its own file, `deployments/<chainId>.claims.json`, so this run can
///      never rewrite the settlement record the backend reads. It takes two steps because
///      forge executes `run()`, file writes and all, before it signs or sends anything: a
///      record written there names the addresses forge predicted, whether or not the
///      transactions then land (no MON, a rejected send, only the first create mined). So
///      a broadcast writes `.claims.pending.json`, and only `confirm()` reads it back,
///      requires code at both addresses answering to the right EIP-712 domains, and writes
///      `.claims.json`. A failed broadcast leaves just the pending file, and rerunning the
///      broadcast replaces it. A simulation writes `.claims.dry-run.json` and a local node
///      `.claims.local.json`, by Deploy's rules and for Deploy's reasons. All three are
///      git-ignored.
contract DeployClaims is Script {
    /// @dev Placeholder sender for a keyless dry run; override with DEPLOYER.
    address internal constant DEFAULT_DEPLOYER = 0x1111111111111111111111111111111111111111;

    error DomainMismatch(address deployed, string expectedName);
    error NotDeployed(address expected);

    HandleRegistry public handleRegistry;
    ClaimEscrow public claimEscrow;

    /// @dev Deploy's broadcast and local-node checks, used rather than restated, so the two
    ///      records can never disagree about which runs are real. Created by this script's
    ///      constructor, outside any broadcast, so it exists only in forge's own EVM.
    Deploy internal immutable rules = new Deploy();

    /// @notice Deploy both contracts, check them, write the record.
    function run() external returns (HandleRegistry registry, ClaimEscrow escrow) {
        (address deployer, uint256 pk) = _deployer();
        console2.log("chain", block.chainid, "block", block.number);
        console2.log("deployer", deployer);

        if (pk != 0) {
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast(deployer);
        }
        registry = new HandleRegistry();
        escrow = new ClaimEscrow();
        vm.stopBroadcast();

        handleRegistry = registry;
        claimEscrow = escrow;

        // Every signature a client makes is bound to this domain, so a wrong one would only
        // show up as "invalid signature" on the first real handle or link. Belt and braces.
        _requireDomain(address(registry), "Henad Handles");
        _requireDomain(address(escrow), "Henad Claims");

        console2.log("HandleRegistry", address(registry));
        console2.log("ClaimEscrow   ", address(escrow));

        _writeJson(deployer);
    }

    /// @notice Turn a broadcast's pending record into the deployment record, once both
    ///         contracts are on the chain `--rpc-url` points at. Sends nothing.
    function confirm() external {
        string memory pending = deploymentFile(block.chainid, true, false);
        string memory json = vm.readFile(pending);
        requireDeployed(vm.parseJsonAddress(json, ".handleRegistry"), vm.parseJsonAddress(json, ".claimEscrow"));

        string memory path = recordFile(block.chainid);
        vm.writeFile(path, json);
        vm.removeFile(pending);
        console2.log("confirmed on chain", block.chainid);
        console2.log("wrote", path);
    }

    /// @notice Path `run()` writes for `chainId`; see the contract notes. A real broadcast
    ///         gets the pending file, never the record itself.
    function deploymentFile(uint256 chainId, bool broadcast, bool local) public pure returns (string memory) {
        string memory base = string.concat("./deployments/", vm.toString(chainId), ".claims");
        if (!broadcast) return string.concat(base, ".dry-run.json");
        return string.concat(base, local ? ".local.json" : ".pending.json");
    }

    /// @notice Path of the deployment record for `chainId`, which only `confirm()` writes.
    function recordFile(uint256 chainId) public pure returns (string memory) {
        return string.concat("./deployments/", vm.toString(chainId), ".claims.json");
    }

    /// @notice Revert unless `registry` and `escrow` both hold code answering to their
    ///         EIP-712 domains on this chain.
    /// @dev Code first, so an address whose create never landed gets a plain answer rather
    ///      than a failed decode inside `eip712Domain`.
    function requireDeployed(address registry, address escrow) public view {
        if (registry.code.length == 0) revert NotDeployed(registry);
        if (escrow.code.length == 0) revert NotDeployed(escrow);
        _requireDomain(registry, "Henad Handles");
        _requireDomain(escrow, "Henad Claims");
    }

    /// @dev PRIVATE_KEY when set; otherwise DEPLOYER (or a placeholder), which `--account`
    ///      signs for when it names the same address.
    function _deployer() internal view returns (address deployer, uint256 pk) {
        pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) return (vm.addr(pk), pk);
        return (vm.envOr("DEPLOYER", DEFAULT_DEPLOYER), 0);
    }

    function _requireDomain(address deployed, string memory expectedName) internal view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            IERC5267(deployed).eip712Domain();
        if (
            keccak256(bytes(name)) != keccak256(bytes(expectedName)) || keccak256(bytes(version)) != keccak256("1")
                || chainId != block.chainid || verifyingContract != deployed
        ) revert DomainMismatch(deployed, expectedName);
    }

    function _writeJson(address deployer) internal {
        bool local = rules.isLocalFork(deployer);

        string memory root = "henadClaims";
        vm.serializeAddress(root, "handleRegistry", address(handleRegistry));
        vm.serializeAddress(root, "claimEscrow", address(claimEscrow));
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeBool(root, "localFork", local);
        string memory json = vm.serializeUint(root, "deployedAtBlock", block.number);

        string memory path = deploymentFile(block.chainid, rules.isBroadcasting(), local);
        vm.writeJson(json, path);
        console2.log("wrote", path);
        if (local) {
            console2.log("  localFork=true: these addresses exist only on the local node, not on chain", block.chainid);
        } else if (rules.isBroadcasting()) {
            console2.log("  pending until the transactions land; then run this script with --sig \"confirm()\"");
        }
    }
}
