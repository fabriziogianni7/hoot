// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HootProgressiveQuizManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Prog is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract HootProgressiveQuizManagerTest is Test {
    HootProgressiveQuizManager public quizManager;
    MockERC20Prog public mockToken;
    address public creator = makeAddr("creator");
    address public a = makeAddr("a");
    address public b = makeAddr("b");
    address public c = makeAddr("c");
    address public treasury = makeAddr("treasury");

    uint256 constant PREC = 1000000; // ratios use PREC
    uint256 constant FEE = 100000; // 10%

    function setUp() public {
        quizManager = new HootProgressiveQuizManager(treasury, FEE, PREC);
        mockToken = new MockERC20Prog();
        vm.deal(creator, 10 ether);
        vm.deal(a, 10 ether);
        vm.deal(b, 10 ether);
        vm.deal(c, 10 ether);
        mockToken.transfer(creator, 1000 ether);
    }

    function testProgressivePerQuestionETH() public {
        string memory quizId = "prog-eth";
        uint256 prize = 1 ether;
        uint256 totalQ = 5;
        vm.prank(creator);
        quizManager.createQuiz{value: prize}(quizId, address(0), prize, totalQ);

        // Question 1 winners
        address[3] memory winners1 = [a, b, c];
        vm.prank(creator);
        quizManager.distributeQuestionPrize(quizId, winners1);

        // Question prize per = 0.2 ether
        // Treasury 10% = 0.02
        // First 40% = 0.08, second 0.06, third 0.04
        assertEq(a.balance, 10 ether + 0.08 ether);
        assertEq(b.balance, 10 ether + 0.06 ether);
        assertEq(c.balance, 10 ether + 0.04 ether);
        assertEq(treasury.balance, 0.02 ether);

        // Process remaining questions with no winners (zeros)
        address[3] memory winnersEmpty = [address(0), address(0), address(0)];
        for (uint256 i = 0; i < totalQ - 1; i++) {
            vm.prank(creator);
            quizManager.distributeQuestionPrize(quizId, winnersEmpty);
        }
    }

    function testProgressiveERC20() public {
        string memory quizId = "prog-erc20";
        uint256 prize = 100 ether;
        uint256 totalQ = 4;
        vm.startPrank(creator);
        mockToken.approve(address(quizManager), prize);
        quizManager.createQuiz(quizId, address(mockToken), prize, totalQ);
        vm.stopPrank();

        address[3] memory winners = [a, b, c];
        vm.prank(creator);
        quizManager.distributeQuestionPrize(quizId, winners);

        // After 1 question of 4: questionPrize=25
        // first 40% of 25 = 10, second 7.5, third 5, treasury 2.5
        assertEq(mockToken.balanceOf(a), 10 ether);
        assertEq(mockToken.balanceOf(b), 7.5 ether);
        assertEq(mockToken.balanceOf(c), 5 ether);
        assertEq(mockToken.balanceOf(treasury), 2.5 ether);
    }
}



