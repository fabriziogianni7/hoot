// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/HootQuizManagerV2.sol";

// forge script script/DeployBase.s.sol \
//   --rpc-url https://mainnet.base.org \
//   --broadcast
contract DeployBaseScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        
        // Treasury fee: 100000 = 10% (with 1M precision)
        // Fee precision: 1000000 = 4 decimal places
        uint256 treasuryFeePercent = vm.envOr("TREASURY_FEE_PERCENT", uint256(100000));
        uint256 feePrecision = vm.envOr("FEE_PRECISION", uint256(1000000));

        vm.startBroadcast(deployerPrivateKey);

        HootQuizManagerV2 quizManager = new HootQuizManagerV2(
            treasury,
            treasuryFeePercent,
            feePrecision
        );

        vm.stopBroadcast();

        console.log("HootQuizManagerV2 deployed to Base at:", address(quizManager));
        console.log("Treasury address:", treasury);
        console.log("Treasury fee percent:", treasuryFeePercent);
        console.log("Fee precision:", feePrecision);
        console.log("Effective fee:", (treasuryFeePercent * 100) / feePrecision, "%");
        console.log("Deployer address:", vm.addr(deployerPrivateKey));
    }
}
