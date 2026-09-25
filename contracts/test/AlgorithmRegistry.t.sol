// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AlgorithmRegistry} from "../src/AlgorithmRegistry.sol";
import {IFeedAlgorithm} from "../src/interfaces/IFeedAlgorithm.sol";

contract FakeAlgo is IFeedAlgorithm {
    string private _name;

    constructor(string memory n) {
        _name = n;
    }

    function rank(address, uint256[] calldata ids)
        external
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        return (new uint256[](ids.length), new uint256[](ids.length));
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function description() external pure returns (string memory) {
        return "fake";
    }
}

contract NotAnAlgo {
// deliberately implements nothing
}

contract AlgorithmRegistryTest is Test {
    AlgorithmRegistry registry;
    FakeAlgo defaultFeed;
    FakeAlgo defaultExplore;
    address alice = address(0xA11CE);

    function setUp() public {
        defaultFeed = new FakeAlgo("Serendipity");
        defaultExplore = new FakeAlgo("Discovery");
        registry = new AlgorithmRegistry(defaultFeed, defaultExplore);
    }

    /// @dev A user who has chosen nothing gets the constructor defaults.
    function test_DefaultsApplyBeforeAnyChoice() public view {
        assertEq(registry.algorithmOf(alice, registry.SLOT_FEED()), address(defaultFeed));
        assertEq(registry.algorithmOf(alice, registry.SLOT_EXPLORE()), address(defaultExplore));
    }

    function test_DefaultsAreRegisteredAtIdsZeroAndOne() public view {
        assertEq(registry.algorithmAt(0), address(defaultFeed));
        assertEq(registry.algorithmAt(1), address(defaultExplore));
        assertEq(registry.algorithmCount(), 2);
    }

    function test_RegisterAssignsIncrementingIds() public {
        FakeAlgo mine = new FakeAlgo("Mine");
        uint256 id = registry.register(mine);
        assertEq(id, 2);
        assertEq(registry.algorithmAt(id), address(mine));
    }

    function test_SetMyAlgorithmChangesOnlyThatSlot() public {
        FakeAlgo mine = new FakeAlgo("Mine");
        uint256 id = registry.register(mine);

        // Read the constants first. vm.prank applies to the next call, and an
        // inline registry.SLOT_FEED() would consume it before setMyAlgorithm.
        uint8 feedSlot = registry.SLOT_FEED();
        uint8 exploreSlot = registry.SLOT_EXPLORE();

        vm.prank(alice);
        registry.setMyAlgorithm(feedSlot, id);

        assertEq(registry.algorithmOf(alice, feedSlot), address(mine));
        assertEq(registry.algorithmOf(alice, exploreSlot), address(defaultExplore));
    }

    function test_ChoiceIsPerUser() public {
        FakeAlgo mine = new FakeAlgo("Mine");
        uint256 id = registry.register(mine);

        uint8 feedSlot = registry.SLOT_FEED();

        vm.prank(alice);
        registry.setMyAlgorithm(feedSlot, id);

        address bob = address(0xB0B);
        assertEq(registry.algorithmOf(bob, feedSlot), address(defaultFeed));
    }

    function test_UnknownAlgorithmIdReverts() public {
        uint8 feedSlot = registry.SLOT_FEED();

        vm.prank(alice);
        vm.expectRevert(AlgorithmRegistry.NoSuchAlgorithm.selector);
        registry.setMyAlgorithm(feedSlot, 999);
    }

    function test_UnknownSlotReverts() public {
        vm.prank(alice);
        vm.expectRevert(AlgorithmRegistry.NoSuchSlot.selector);
        registry.setMyAlgorithm(7, 0);
    }

    /// @dev Registration must reject anything that cannot answer name(),
    ///      so the UI never lists an entry it cannot render.
    function test_RegisteringNonAlgorithmReverts() public {
        NotAnAlgo bad = new NotAnAlgo();
        vm.expectRevert(AlgorithmRegistry.NotAnAlgorithm.selector);
        registry.register(IFeedAlgorithm(address(bad)));
    }

    function test_RegisteringZeroAddressReverts() public {
        vm.expectRevert(AlgorithmRegistry.NotAnAlgorithm.selector);
        registry.register(IFeedAlgorithm(address(0)));
    }
}
