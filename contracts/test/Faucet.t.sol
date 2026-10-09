// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Faucet} from "../src/Faucet.sol";

contract FaucetTest is Test {
    Faucet faucet;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        faucet = new Faucet();
        vm.deal(address(faucet), 30 ether);
        vm.deal(alice, 0);
        vm.deal(bob, 0);
    }

    function test_ClaimSendsTheFixedAmount() public {
        vm.prank(alice);
        faucet.claim();
        assertEq(alice.balance, 3 ether);
        assertEq(address(faucet).balance, 27 ether);
        assertTrue(faucet.claimed(alice));
    }

    function test_SecondClaimIsRefused() public {
        vm.prank(alice);
        faucet.claim();

        vm.prank(alice);
        vm.expectRevert(Faucet.AlreadyClaimed.selector);
        faucet.claim();
        assertEq(alice.balance, 3 ether);
    }

    function test_EachWalletClaimsOnce() public {
        vm.prank(alice);
        faucet.claim();
        vm.prank(bob);
        faucet.claim();

        assertEq(alice.balance, 3 ether);
        assertEq(bob.balance, 3 ether);
        assertEq(address(faucet).balance, 24 ether);
    }

    /// @dev The float is finite and shared: when it cannot cover one more
    ///      claim it reverts, and nobody loses their one shot to a partial
    ///      transfer.
    function test_EmptyFaucetRevertsAndKeepsTheClaim() public {
        vm.deal(address(faucet), 2 ether);

        vm.prank(alice);
        vm.expectRevert(Faucet.Empty.selector);
        faucet.claim();

        assertFalse(faucet.claimed(alice));
        assertEq(alice.balance, 0);
    }

    function test_AnyoneCanFund() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(faucet).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(faucet).balance, 31 ether);
    }

    function test_ClaimEmitsTheAccountAndAmount() public {
        vm.expectEmit(true, false, false, true, address(faucet));
        emit Faucet.Claimed(alice, 3 ether);
        vm.prank(alice);
        faucet.claim();
    }

    /// @dev A contract that refuses MON must not burn the claim: the revert
    ///      rolls the flag back, so the wallet can try again or receive it
    ///      another way.
    function test_RefusedTransferKeepsTheClaimOpen() public {
        Rejector rejector = new Rejector(faucet);
        vm.expectRevert(Faucet.TransferFailed.selector);
        rejector.claim();
        assertFalse(faucet.claimed(address(rejector)));
    }

    /// @dev The exact rule the client follows: the address has claimed, so
    ///      the button is already spent.
    function test_ClaimedReflectsTheRule() public {
        assertFalse(faucet.claimed(bob));
        vm.prank(bob);
        faucet.claim();
        assertTrue(faucet.claimed(bob));
    }
}

contract Rejector {
    Faucet private immutable faucet;

    constructor(Faucet faucet_) {
        faucet = faucet_;
    }

    function claim() external {
        faucet.claim();
    }

    receive() external payable {
        revert("no");
    }
}
