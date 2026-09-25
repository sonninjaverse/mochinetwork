// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CommunityRegistry} from "../src/CommunityRegistry.sol";

/// @notice Adds communities to an existing deployment without replacing any registry.
contract DeployCommunity is Script {
    function run() external {
        vm.startBroadcast();
        CommunityRegistry registry = new CommunityRegistry();
        vm.stopBroadcast();
        console.log("CommunityRegistry", address(registry));
    }
}
