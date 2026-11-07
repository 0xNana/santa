// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Writes test/vectors/claim.json, the one fixed claim-digest case the TypeScript side must reproduce
// (threat model standard 2: one claim encoding, checked by both sides). The vault sits at a fixed CREATE
// address on chain id 46630, and every hash is recomputed here from the EIP-712 spec, independently of the vault.
// Does NOT cover: signing (the vector holds no key or signature), other chain ids or vault addresses, or the
// TypeScript assertion itself, which lives in packages/core.

import {Test} from "forge-std/Test.sol";
import {SantaVault} from "../src/SantaVault.sol";

contract ClaimVectorTest is Test {
    string internal constant VECTOR_PATH = "./test/vectors/claim.json";
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 internal constant GIFT_ID = 1;

    function test_writesClaimVectorMatchingVault() public {
        vm.chainId(46630);
        address deployer = makeAddr("santa-vector-deployer");
        address recipient = makeAddr("santa-vector-recipient");
        vm.prank(deployer);
        SantaVault vault = new SantaVault(deployer, makeAddr("santa-vector-relayer"), new address[](0));
        assertEq(address(vault), vm.computeCreateAddress(deployer, 0));

        bytes32 domainSeparator =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("Santa"), keccak256("1"), uint256(46630), address(vault)));
        bytes32 structHash =
            keccak256(abi.encode(keccak256("Claim(uint256 giftId,address recipient)"), GIFT_ID, recipient));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(vault.claimDigest(GIFT_ID, recipient), digest);

        string memory json = string.concat(
            "{\n",
            '  "vault": "',
            vm.toString(address(vault)),
            '",\n',
            '  "chainId": 46630,\n',
            '  "giftId": "',
            vm.toString(GIFT_ID),
            '",\n',
            '  "recipient": "',
            vm.toString(recipient),
            '",\n',
            '  "domainSeparator": "',
            vm.toString(domainSeparator),
            '",\n',
            '  "structHash": "',
            vm.toString(structHash),
            '",\n',
            '  "digest": "',
            vm.toString(digest),
            '"\n',
            "}\n"
        );
        vm.writeFile(VECTOR_PATH, json);

        string memory written = vm.readFile(VECTOR_PATH);
        assertEq(vm.parseJsonKeys(written, "$").length, 7);
        assertEq(vm.parseJsonAddress(written, ".vault"), address(vault));
        assertEq(vm.parseJsonUint(written, ".chainId"), 46630);
        assertEq(vm.parseJsonString(written, ".giftId"), "1");
        assertEq(vm.parseJsonAddress(written, ".recipient"), recipient);
        assertEq(vm.parseJsonBytes32(written, ".domainSeparator"), domainSeparator);
        assertEq(vm.parseJsonBytes32(written, ".structHash"), structHash);
        assertEq(vm.parseJsonBytes32(written, ".digest"), digest);
    }
}
