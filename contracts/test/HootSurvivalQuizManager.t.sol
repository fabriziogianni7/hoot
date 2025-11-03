// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HootSurvivalQuizManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Surv is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract HootSurvivalQuizManagerTest is Test {
    HootSurvivalQuizManager public quizManager;
    MockERC20Surv public mockToken;
    address public creator = makeAddr("creator");
    address public s1 = makeAddr("s1");
    address public s2 = makeAddr("s2");
    address public s3 = makeAddr("s3");
    address public treasury = makeAddr("treasury");

    uint256 constant PREC = 1000000;
    uint256 constant FEE = 100000; // 10%

    function setUp() public {
        quizManager = new HootSurvivalQuizManager(treasury, FEE, PREC);
        mockToken = new MockERC20Surv();
        vm.deal(creator, 10 ether);
        vm.deal(s1, 10 ether);
        vm.deal(s2, 10 ether);
        vm.deal(s3, 10 ether);
        mockToken.transfer(creator, 1000 ether);
    }

    function testDistributeEquallyETH() public {
        string memory quizId = "surv-eth";
        vm.prank(creator);
        quizManager.createQuiz{value: 1 ether}(quizId, address(0), 1 ether);
        address[] memory survivors = new address[](3);
        survivors[0] = s1; survivors[1] = s2; survivors[2] = s3;
        // per survivor 1/3 ether, treasury 0.1, adjust rounding goes to first
        vm.prank(creator);
        quizManager.distributePrize(quizId, survivors);
        // winners got roughly equal, first may have rounding dust
        uint256 totalReceived = s1.balance + s2.balance + s3.balance - 30 ether;
        assertEq(totalReceived + treasury.balance, 1 ether);
    }

    function testNoSurvivorsPrizeBackToCreator_ERC20() public {
        string memory quizId = "surv-erc20";
        uint256 prize = 100 ether;
        vm.startPrank(creator);
        mockToken.approve(address(quizManager), prize);
        quizManager.createQuiz(quizId, address(mockToken), prize);
        vm.stopPrank();
        // no survivors passed
        uint256 beforeCreator = mockToken.balanceOf(creator);
        vm.prank(creator);
        address[] memory none = new address[](0);
        quizManager.distributePrize(quizId, none);
        assertEq(mockToken.balanceOf(creator), beforeCreator + prize);
    }
}



