// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC3009} from "../../src/interfaces/external/IERC3009.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title MockERC3009Token
/// @notice ERC20 plus the ERC-3009 subset CorridorRouter uses, with a real EIP-712
///         domain ("Mock", "1", chainId, this) and the canonical ERC-3009 typehashes
///         so the test signs exactly what AUSD/USDC would verify. Stands in for AUSD.
/// @dev Mirrors the on-chain semantics recorded in docs/INTEGRATION-FACTS.md §14.4:
///      `receiveWithAuthorization` enforces `to == msg.sender`, strict time bounds
///      (`validAfter < now < validBefore`), single-use bytes32 nonces per authorizer,
///      and ECDSA recovery against `from`. `cancelAuthorization` burns a nonce.
contract MockERC3009Token is IERC3009, MockERC20, EIP712 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    mapping(address authorizer => mapping(bytes32 nonce => bool used)) private _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error CallerMustBePayee(address caller, address to);
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed(address authorizer, bytes32 nonce);
    error InvalidSignature();

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        MockERC20(name_, symbol_, decimals_)
        EIP712("Mock", "1")
    {}

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        if (to != msg.sender) revert CallerMustBePayee(msg.sender, to);
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[from][nonce]) revert AuthorizationAlreadyUsed(from, nonce);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce))
        );
        if (ECDSA.recover(digest, signature) != from) revert InvalidSignature();

        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes calldata signature) external {
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationAlreadyUsed(authorizer, nonce);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)));
        if (ECDSA.recover(digest, signature) != authorizer) revert InvalidSignature();

        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }
}
