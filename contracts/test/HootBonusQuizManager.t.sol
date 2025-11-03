// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HootBonusQuizManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Bonus is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract HootBonusQuizManagerTest is Test {
    HootBonusQuizManager public quizManager;
    MockERC20Bonus public mockToken;
    address public creator = makeAddr("creator");
    address public w1 = makeAddr("w1");
    address public w2 = makeAddr("w2");
    address public w3 = makeAddr("w3");
    address public treasury = makeAddr("treasury");

    uint256 constant PREC = 1000000;
    uint256 constant FEE = 100000; // 10%

    function setUp() public {
        quizManager = new HootBonusQuizManager(treasury, FEE, PREC);
        mockToken = new MockERC20Bonus();
        vm.deal(creator, 10 ether);
        vm.deal(w1, 10 ether);
        vm.deal(w2, 10 ether);
        vm.deal(w3, 10 ether);
        mockToken.transfer(creator, 1000 ether);
    }

    function testBonusAllCorrect_DistributesExtraToWinners_ETH() public {
        string memory quizId = "bonus-eth";
        // base prize 1 ether + extra 0.3 ether at creation
        vm.prank(creator);
        quizManager.createQuiz{value: 1.3 ether}(quizId, address(0), 1 ether, 0.3 ether);

        // set winners and amounts sum to 0.9 ether (10% fee)
        address[] memory winners = new address[](3);
        winners[0] = w1; winners[1] = w2; winners[2] = w3;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 0.45 ether; amounts[1] = 0.27 ether; amounts[2] = 0.18 ether;

        // distribute golden bounty equally to winners
        vm.prank(creator);
        quizManager.distributeGoldenBounty(quizId, winners);

        // distribute base prizes
        vm.prank(creator);
        quizManager.distributePrize(quizId, winners, amounts);

        // each winner received extraPerWinner = 0.3 / 3 = 0.1 ether
        assertEq(w1.balance, 10 ether + 0.45 ether + 0.1 ether);
        assertEq(w2.balance, 10 ether + 0.27 ether + 0.1 ether);
        assertEq(w3.balance, 10 ether + 0.18 ether + 0.1 ether);
        // treasury received 10% of base(1 ether) = 0.1 ether
        assertEq(treasury.balance, 0.1 ether);
    }

    function testBonusNotAllCorrect_SendsExtraToTreasury_ERC20() public {
        string memory quizId = "bonus-erc20";
        uint256 prize = 100 ether;
        uint256 extra = 30 ether;
        // setup balances
        vm.startPrank(creator);
        mockToken.approve(address(quizManager), prize + extra);
        quizManager.createQuiz(quizId, address(mockToken), prize, extra);
        vm.stopPrank();

        // winners total 90, treasury 10, extra to treasury (30)
        address[] memory winners = new address[](3);
        winners[0] = w1; winners[1] = w2; winners[2] = w3;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 45 ether; amounts[1] = 30 ether; amounts[2] = 15 ether;

        // distribute golden bounty to treasury (no recipients)
        vm.prank(creator);
        address[] memory none = new address[](0);
        quizManager.distributeGoldenBounty(quizId, none);
        uint256 treasuryInitial = mockToken.balanceOf(treasury);

        vm.prank(creator);
        quizManager.distributePrize(quizId, winners, amounts);

        // winners received base amounts only
        assertEq(mockToken.balanceOf(w1), 45 ether);
        assertEq(mockToken.balanceOf(w2), 30 ether);
        assertEq(mockToken.balanceOf(w3), 15 ether);
        // treasury received base fee 10 (extra already added before treasuryInitial)
        assertEq(mockToken.balanceOf(treasury), treasuryInitial + 10 ether);
    }
}



