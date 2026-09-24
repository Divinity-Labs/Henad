// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title BareDelegate
/// @notice An EIP-7702 delegate with no `isValidSignature`. SignatureChecker on its own
///         would reject every signature from an EOA delegated here; the fallback only lets
///         the delegation transaction itself succeed.
contract BareDelegate {
    fallback() external payable {}
}
