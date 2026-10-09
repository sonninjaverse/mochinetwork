// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Faucet} from "../src/Faucet.sol";

/// @notice Deploys the one-claim tMON faucet.
///
/// @dev Funding is a separate transfer on purpose: the deployer key should not
///      need to hold the whole float, and topping the faucet up later is a
///      normal operation rather than a redeploy. After deploying, send MON to
///      the address it printed:
///
///        cast send <faucet> --value 30ether \
///          --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY"
///
///      Thirty tMON is ten first claims; refill whenever the balance runs low.
contract DeployFaucet is Script {
    function run() external {
        vm.startBroadcast();
        Faucet faucet = new Faucet();
        vm.stopBroadcast();

        console.log("Faucet", address(faucet));
        console.log("Claim amount, wei", faucet.CLAIM_AMOUNT());
        console.log("Fund it before announcing it.");
    }
}
