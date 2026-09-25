// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";
import {PostRegistry} from "../src/PostRegistry.sol";
import {AlgorithmRegistry} from "../src/AlgorithmRegistry.sol";
import {BestFeed} from "../src/algorithms/BestFeed.sol";
import {ChronoFeed} from "../src/algorithms/ChronoFeed.sol";
import {ControversialFeed} from "../src/algorithms/ControversialFeed.sol";
import {HotFeed} from "../src/algorithms/HotFeed.sol";

/// Redeploys only the karma-aware half: posts and the sorts that read them.
/// Identity and Community stay where they are — the new PostRegistry points at
/// the community registry already deployed.
contract RedeployPosts is Script {
    function run() external {
        // Passed in rather than hard-coded so the deployment is reproducible
        // against whatever registry is live: COMMUNITY_REGISTRY=0x… forge …
        CommunityRegistry communities = CommunityRegistry(vm.envAddress("COMMUNITY_REGISTRY"));

        vm.startBroadcast();

        PostRegistry posts = new PostRegistry(communities);
        ChronoFeed chrono = new ChronoFeed(posts);
        HotFeed hot = new HotFeed(posts, block.timestamp);
        BestFeed best = new BestFeed(posts);
        ControversialFeed controversial = new ControversialFeed(posts);

        AlgorithmRegistry registry = new AlgorithmRegistry(hot, best);
        registry.register(controversial);
        registry.register(chrono);

        vm.stopBroadcast();

        console.log("PostRegistry     ", address(posts));
        console.log("AlgorithmRegistry", address(registry));
        console.log("HotFeed          ", address(hot));
        console.log("BestFeed         ", address(best));
        console.log("ControversialFeed", address(controversial));
        console.log("ChronoFeed       ", address(chrono));
    }
}
