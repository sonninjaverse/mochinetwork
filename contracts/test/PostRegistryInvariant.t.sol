// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";

/// @dev Fuzz driver: random actors like and unlike a small set of posts.
contract LikeHandler is Test {
    PostRegistry public posts;
    address[] public actors;
    uint256 public postCount;

    constructor(PostRegistry posts_, address author) {
        posts = posts_;
        for (uint256 i; i < 10; ++i) actors.push(address(uint160(0xAC70000 + i)));
        vm.startPrank(author);
        for (uint256 i; i < 3; ++i) posts.post("p", "");
        vm.stopPrank();
        postCount = 3;
    }

    function like(uint256 actor, uint256 id) external {
        vm.prank(actors[actor % actors.length]);
        posts.like((id % postCount) + 1);
    }

    function unlike(uint256 actor, uint256 id) external {
        vm.prank(actors[actor % actors.length]);
        posts.unlike((id % postCount) + 1);
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}

contract PostRegistryInvariantTest is Test {
    PostRegistry posts;
    LikeHandler handler;
    address author = address(0xA07);

    function setUp() public {
        posts = new PostRegistry(new CommunityRegistry());
        handler = new LikeHandler(posts, author);
        targetContract(address(handler));
    }

    /// @notice likeCount must always equal the number of accounts whose
    ///         hasLiked flag is set. A drift here means the counter is lying
    ///         to every ranking algorithm that reads it.
    function invariant_LikeCountMatchesHasLiked() public view {
        uint256 actors = handler.actorCount();
        for (uint256 id = 1; id <= 3; ++id) {
            uint256 counted;
            for (uint256 i; i < actors; ++i) {
                if (posts.hasLiked(id, handler.actorAt(i))) ++counted;
            }
            assertEq(posts.postOf(id).likeCount, counted);
        }
    }
}
