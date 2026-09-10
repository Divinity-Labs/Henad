// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MonadMainnet as M} from "./MonadMainnet.sol";

/// @title ForkTest
/// @notice Base for tests that run against a fork of Monad mainnet.
/// @dev Requires `network = "monad"` + `hardfork = "monad:MonadTen"` in foundry.toml
///      (already set). Env:
///        MONAD_MAINNET_RPC_URL  rpc for the fork (default https://rpc.monad.xyz)
///        MONAD_FORK_BLOCK       0 = latest, else a pinned block (default PINNED_BLOCK)
///      rpc.monad.xyz serves state back roughly 1,000,000 blocks (~3.5 days), so
///      PINNED_BLOCK must be bumped at least twice a week or the tests fail with
///      "historical state that is not available". Fork cache: ~/.foundry/cache/rpc/monad/<block>.
abstract contract ForkTest is Test {
    /// @dev Pinned 2026-09-10 (MonadTen, FX market open). Bump regularly.
    uint256 internal constant PINNED_BLOCK = 103_629_140;

    uint256 internal forkId;

    function _forkMainnet() internal returns (uint256 blockNumber) {
        string memory rpc = vm.envOr("MONAD_MAINNET_RPC_URL", string("https://rpc.monad.xyz"));
        uint256 pin = vm.envOr("MONAD_FORK_BLOCK", PINNED_BLOCK);
        forkId = pin == 0 ? vm.createSelectFork(rpc) : vm.createSelectFork(rpc, pin);
        assertEq(block.chainid, M.CHAIN_ID, "not Monad mainnet");
        return block.number;
    }

    function _forkMainnetAt(uint256 blockNumber) internal {
        string memory rpc = vm.envOr("MONAD_MAINNET_RPC_URL", string("https://rpc.monad.xyz"));
        forkId = vm.createSelectFork(rpc, blockNumber);
        assertEq(block.chainid, M.CHAIN_ID, "not Monad mainnet");
    }

    /// @notice Give `to` AUSD by writing its packed balance slot. Also asserts the
    ///         storage root has not moved (an AgoraDollar upgrade would break this).
    function _dealAUSD(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = M.AUSD.staticcall(abi.encodeWithSignature("ERC20_CORE_STORAGE_SLOT()"));
        if (ok && ret.length == 32) {
            assertEq(abi.decode(ret, (bytes32)), M.AUSD_ERC20_CORE_STORAGE_SLOT, "AUSD storage root moved");
        }
        bytes32 slot = keccak256(abi.encode(to, M.AUSD_ERC20_CORE_STORAGE_SLOT));
        vm.store(M.AUSD, slot, bytes32(amount << 8)); // isFrozen = false
        assertEq(IERC20(M.AUSD).balanceOf(to), amount, "dealAUSD failed");
    }

    /// @notice Give `to` a Mento stable (USDm/GBPm/…): plain OZ ERC20Upgradeable, deal() works.
    function _dealMentoStable(address token, address to, uint256 amount) internal {
        deal(token, to, amount);
        assertEq(IERC20(token).balanceOf(to), amount, "deal failed");
    }
}
