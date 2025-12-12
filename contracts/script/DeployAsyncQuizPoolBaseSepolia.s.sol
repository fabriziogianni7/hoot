// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AsyncQuizPool.sol";

// forge script script/DeployAsyncQuizPoolBaseSepolia.s.sol \
//   --rpc-url https://base-sepolia.drpc.org \
//   --broadcast
contract DeployAsyncQuizPoolBaseSepolia is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address protocolTreasury = vm.envAddress("TREASURY_ADDRESS");
        uint16 creatorFeeBps = uint16(vm.envOr("CREATOR_FEE_BPS", uint256(700)));
        uint16 protocolFeeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(300)));

        vm.startBroadcast(deployerPrivateKey);

        AsyncQuizPool pool = new AsyncQuizPool(protocolTreasury, creatorFeeBps, protocolFeeBps);

        vm.stopBroadcast();

        console.log("AsyncQuizPool deployed to Base Sepolia at:", address(pool));
        console.log("Protocol treasury:", protocolTreasury);
        console.log("Creator fee bps:", creatorFeeBps);
        console.log("Protocol fee bps:", protocolFeeBps);
        console.log("Deployer address:", vm.addr(deployerPrivateKey));
    }
}

