// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/HootQuizManager.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);

        HootQuizManager quizManager = new HootQuizManager(treasury);

        vm.stopBroadcast();

        console.log("HootQuizManager deployed at:", address(quizManager));
        console.log("Treasury address:", treasury);
    }
}
