// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SantaVault} from "../src/SantaVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SantaVaultTest is Test {
    SantaVault vault;
    MockERC20 stock;
    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address relayer = makeAddr("relayer");
    uint256 constant CLAIM_KEY = 12345;

    function setUp() public {
        vm.chainId(46630);
        vm.warp(1800000000);
        stock = new MockERC20("Test Stock", "TEST");
        address[] memory tokens = new address[](1);
        tokens[0] = address(stock);
        vault = new SantaVault(address(this), relayer, tokens);
        vm.startPrank(sender);
        stock.mint(sender, 100 ether);
        stock.approve(address(vault), 5 ether);
        vm.stopPrank();
    }

    function signed(bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CLAIM_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function createGift() internal returns (uint256 id) {
        bytes memory proof = signed(vault.registerDigest(sender));
        vm.prank(sender);
        return
            vault.createGift(
                address(stock), 5 ether, vm.addr(CLAIM_KEY), uint64(block.timestamp + 7 days), hex"", proof
            );
    }

    function test_plainErc20GiftCanBeClaimed() public {
        uint256 id = createGift();
        assertTrue(vault.senderIsCompliant(id));
        bytes memory signature = signed(vault.claimDigest(id, recipient));
        vm.prank(relayer);
        vault.claim(id, recipient, signature);
        assertEq(stock.balanceOf(recipient), 5 ether);
        assertEq(vault.liabilities(address(stock)), 0);
        assertEq(uint256(vault.getGift(id).state), uint256(SantaVault.State.Claimed));
    }

    function test_unopenedGiftCanBeRefundedAfterExpiry() public {
        uint256 id = createGift();
        vm.warp(block.timestamp + 7 days);
        vm.prank(sender);
        vault.refund(id);
        assertEq(stock.balanceOf(sender), 100 ether);
        assertEq(vault.liabilities(address(stock)), 0);
    }

    function test_claimSignatureCannotCrossChains() public {
        uint256 id = createGift();
        bytes memory signature = signed(vault.claimDigest(id, recipient));
        vm.chainId(56);
        vm.prank(relayer);
        vm.expectRevert();
        vault.claim(id, recipient, signature);
        assertEq(stock.balanceOf(recipient), 0);
    }
}
