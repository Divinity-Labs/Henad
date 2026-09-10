// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title IERC3009
/// @notice Transfer-with-authorization subset implemented by AUSD (in its proxy,
///         domain "Agora Dollar"/"1") and by Circle USDC ("USDC"/"2") on Monad
///         (docs/INTEGRATION-FACTS.md §14.4). Only `receiveWithAuthorization` is
///         used for pulls: it enforces `to == msg.sender`, so a payer's signature
///         can only ever be consumed by the contract it names. Time checks are
///         strict (`validAfter < block.timestamp < validBefore`), so pass
///         validAfter = 0. Nonces are arbitrary bytes32, single-use per
///         (token, authorizer); Henad sets nonce = intentId so the one signature
///         binds the whole intent.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes calldata signature) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
