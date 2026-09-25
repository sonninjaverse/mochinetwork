// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {PostRegistry} from "../../src/PostRegistry.sol";

/**
 * @notice Sets an account's karma directly, for tests of the ranking formulas.
 *
 * @dev The formulas are calibrated so that one whole vote is 100 weight, and
 *      with the ladder starting at 1 the only honest way to reach 100 is to
 *      have fifty distinct accounts upvote you. Tests that check Reddit's
 *      arithmetic do not need that story; they need a voter at a known weight.
 *
 *      The write is asserted afterwards, so a storage-layout change fails here
 *      loudly instead of quietly setting the wrong slot.
 */
library Weight {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// karmaOf is slot 6 of PostRegistry: nextPostId, _posts, hasLiked,
    /// hasDisliked, _likeWeight, _dislikeWeight, then karmaOf.
    uint256 private constant KARMA_SLOT = 6;

    function trust(PostRegistry posts, address who, int256 karma) internal {
        VM.store(
            address(posts),
            keccak256(abi.encode(who, KARMA_SLOT)),
            bytes32(uint256(karma))
        );
        require(posts.karmaOf(who) == karma, "Weight: storage layout moved");
    }
}
