// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SantaVault} from "../src/SantaVault.sol";

/// @notice Deploys SantaVault with explicitly configured testnet stock tokens.
/// @dev SANTA_STOCK_ADDRESSES may supply a comma-separated list of existing testnet ERC-20s.
contract Deploy is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidToken(address token);
    error NoTokensConfigured();
    error InvalidOwnerOrRelayer();

    function run() external returns (SantaVault vault) {
        if (block.chainid != 46630 && block.chainid != 31337) revert UnsupportedChain(block.chainid);
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address relayer = vm.envAddress("SANTA_RELAYER_ADDRESS");
        address owner = vm.envOr("SANTA_OWNER_ADDRESS", deployer);
        if (owner == address(0) || relayer == address(0) || relayer == owner || relayer == deployer) {
            revert InvalidOwnerOrRelayer();
        }
        address[] memory tokens = vm.envOr("SANTA_STOCK_ADDRESSES", ",", new address[](0));
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i].code.length == 0 || IERC20Metadata(tokens[i]).decimals() > 18) {
                revert InvalidToken(tokens[i]);
            }
        }
        if (tokens.length == 0) revert NoTokensConfigured();
        vm.startBroadcast(key);
        vault = new SantaVault(deployer, relayer, tokens);
        if (owner != deployer) vault.transferOwnership(owner);
        vm.stopBroadcast();
        console.log("Robinhood testnet chain id:", block.chainid);
        console.log("SANTA_VAULT_ADDRESS:", address(vault));
        console.log("Set NEXT_PUBLIC_SANTA_VAULT_ADDRESS to the same address.");
        for (uint256 i; i < tokens.length; ++i) {
            console.log("test token:", tokens[i]);
        }
    }
}
