// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ITransferPolicy {
    function checkIsCompliant(address token, address user) external view;
}

/// @notice The bStock compliance contract reduced to its per-token blocklist (Compliance at 0x53dBa7Aa...14F4).
contract MockCompliance is ITransferPolicy {
    error UserBlocked();

    mapping(address token => mapping(address user => bool)) public blocked;

    function setBlocked(address token, address user, bool isBlocked) external {
        blocked[token][user] = isBlocked;
    }

    function checkIsCompliant(address token, address user) external view {
        if (blocked[token][user]) revert UserBlocked();
    }
}
