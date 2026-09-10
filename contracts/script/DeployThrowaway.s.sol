// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/// @title ToolchainProbe
/// @notice The cheapest possible contract that still proves something: it records the
///         block it was deployed in and answers a constant.
/// @dev Deployed before the real stack so that the first mainnet transaction ever sent
///      with this toolchain (Foundry 1.8.1, solc 0.8.31, evm_version osaka,
///      hardfork monad:MonadTen) costs a few cents rather than the whole deployment.
///      Nothing verified in docs/INTEGRATION-FACTS.md §14.5 has been broadcast yet:
///      the compiler settings, the RPC, the gas estimate, the nonce handling and both
///      verification endpoints are all unexercised until this lands.
contract ToolchainProbe {
    /// @notice Human-readable label, so the verified source is recognisable on the explorer.
    string public constant NAME = "henad:toolchain-probe";

    /// @notice Block this probe was deployed in.
    uint64 public immutable deployedAtBlock;

    constructor() {
        deployedAtBlock = uint64(block.number);
    }
}

/// @title DeployThrowaway
/// @notice Deploys one `ToolchainProbe`. Throwaway on purpose: nothing references it.
/// @dev Dry run:
///        forge script script/DeployThrowaway.s.sol:DeployThrowaway --rpc-url $MONAD_MAINNET_RPC_URL
///      Broadcast: add `--broadcast` and set PRIVATE_KEY.
contract DeployThrowaway is Script {
    /// @dev Placeholder sender for a keyless dry run; override with DEPLOYER.
    address internal constant DEFAULT_DEPLOYER = 0x1111111111111111111111111111111111111111;

    /// @notice Deploy the probe.
    /// @return probe The deployed contract, for the verification command.
    function run() external returns (ToolchainProbe probe) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : vm.envOr("DEPLOYER", DEFAULT_DEPLOYER);

        console2.log("chain", block.chainid, "block", block.number);
        console2.log("deployer", deployer);

        if (pk != 0) {
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast(deployer);
        }
        probe = new ToolchainProbe();
        vm.stopBroadcast();

        console2.log("ToolchainProbe", address(probe));
        console2.log("deployedAtBlock", probe.deployedAtBlock());
    }
}
