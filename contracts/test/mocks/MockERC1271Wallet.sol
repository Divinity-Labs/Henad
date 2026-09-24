// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MockERC1271Wallet
/// @notice The smallest contract wallet: one signing key, checked through ERC-1271. The
///         wallet's own address has no key, so the only way a signature can be valid for
///         it is through `isValidSignature`, which is what the test needs to isolate.
contract MockERC1271Wallet is IERC1271 {
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(hash, signature);
        return err == ECDSA.RecoverError.NoError && recovered == signer
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }
}
