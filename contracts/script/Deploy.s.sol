// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommunityRegistry} from "../src/CommunityRegistry.sol";
import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {AlgorithmRegistry} from "../src/AlgorithmRegistry.sol";
import {BestFeed} from "../src/algorithms/BestFeed.sol";
import {ChronoFeed} from "../src/algorithms/ChronoFeed.sol";
import {ControversialFeed} from "../src/algorithms/ControversialFeed.sol";
import {HotFeed} from "../src/algorithms/HotFeed.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        IdentityRegistry identity = new IdentityRegistry();
        // Communities first: a community post may only be written by a member,
        // so PostRegistry has to know who to ask.
        CommunityRegistry communities = new CommunityRegistry();
        PostRegistry posts = new PostRegistry(communities);

        ChronoFeed chrono = new ChronoFeed(posts);

        // Reddit's three, taken from _sorts.pyx rather than reinvented. Hot
        // anchors its time term to deployment for the same reason reddit
        // anchored theirs to launch day: it keeps the linear term at a size
        // where the logarithmic vote term still registers.
        HotFeed hot = new HotFeed(posts, block.timestamp);
        BestFeed bestSort = new BestFeed(posts);
        ControversialFeed controversial = new ControversialFeed(posts);

        // Hot is the default: it is the only ranking here that does not depend
        // on the viewer, so a brand new account sees a full feed rather than an
        // empty one. Best takes the second slot; the client lists both.
        AlgorithmRegistry registry = new AlgorithmRegistry(hot, bestSort);
        registry.register(controversial);
        registry.register(chrono);

        vm.stopBroadcast();

        console.log("IdentityRegistry ", address(identity));
        console.log("PostRegistry     ", address(posts));
        console.log("CommunityRegistry", address(communities));
        console.log("AlgorithmRegistry", address(registry));
        console.log("HotFeed          ", address(hot));
        console.log("BestFeed         ", address(bestSort));
        console.log("ControversialFeed", address(controversial));
        console.log("ChronoFeed       ", address(chrono));
    }
}
