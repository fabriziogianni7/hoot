// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HootQuizManagerV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20V2 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract HootQuizManagerV2Test is Test {
    HootQuizManagerV2 public quizManager;
    MockERC20V2 public mockToken;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public treasury;
    address public owner;
    
    uint256 constant FEE_PRECISION = 1000000; // 1M = 4 decimal precision
    uint256 constant TREASURY_FEE = 100000; // 10% fee

    function setUp() public {
        owner = address(this);
        treasury = makeAddr("treasury");
        quizManager = new HootQuizManagerV2(treasury, TREASURY_FEE, FEE_PRECISION);
        mockToken = new MockERC20V2();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
        vm.deal(treasury, 0 ether);
        mockToken.transfer(alice, 1000 * 10**18);
        mockToken.transfer(bob, 1000 * 10**18);
        mockToken.transfer(charlie, 1000 * 10**18);
    }

    function testCreateETHQuiz() public {
        string memory quizId = "test-quiz-1";
        uint256 prizeAmount = 1 ether;
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        HootQuizManagerV2.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertEq(quiz.quizId, quizId);
        assertEq(quiz.creator, alice);
        assertEq(quiz.prizeToken, address(0));
        assertEq(quiz.prizeAmount, prizeAmount);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManagerV2.QuizStatus.Pending));
    }

    function testCreateERC20Quiz() public {
        string memory quizId = "test-quiz-2";
        uint256 prizeAmount = 100 * 10**18;
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        vm.stopPrank();
        HootQuizManagerV2.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertEq(quiz.prizeToken, address(mockToken));
        assertEq(quiz.prizeAmount, prizeAmount);
    }

    function testDistributePrizeETH() public {
        string memory quizId = "test-quiz-3";
        uint256 prizeAmount = 1 ether;
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        address[] memory winners = new address[](3);
        winners[0] = alice; winners[1] = bob; winners[2] = charlie;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 0.45 ether; amounts[1] = 0.27 ether; amounts[2] = 0.18 ether;
        vm.prank(alice);
        quizManager.distributePrize(quizId, winners, amounts);
        assertEq(alice.balance, 9.45 ether);
        assertEq(bob.balance, 10.27 ether);
        assertEq(charlie.balance, 10.18 ether);
        assertEq(treasury.balance, 0.1 ether);
        HootQuizManagerV2.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManagerV2.QuizStatus.Completed));
    }

    function testERC20Distribution() public {
        string memory quizId = "test-quiz-erc20";
        uint256 prizeAmount = 100 * 10**18;
        uint256 aliceInitialBalance = mockToken.balanceOf(alice);
        uint256 bobInitialBalance = mockToken.balanceOf(bob);
        uint256 charlieInitialBalance = mockToken.balanceOf(charlie);
        uint256 treasuryInitialBalance = mockToken.balanceOf(treasury);
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        quizManager.setQuizActive(quizId);
        vm.stopPrank();
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - prizeAmount);
        assertEq(mockToken.balanceOf(address(quizManager)), prizeAmount);
        address[] memory winners = new address[](3);
        winners[0] = bob; winners[1] = charlie; winners[2] = alice;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 45 * 10**18; amounts[1] = 30 * 10**18; amounts[2] = 15 * 10**18;
        vm.prank(alice);
        quizManager.distributePrize(quizId, winners, amounts);
        assertEq(mockToken.balanceOf(bob), bobInitialBalance + 45 * 10**18);
        assertEq(mockToken.balanceOf(charlie), charlieInitialBalance + 30 * 10**18);
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - prizeAmount + 15 * 10**18);
        assertEq(mockToken.balanceOf(treasury), treasuryInitialBalance + 10 * 10**18);
        assertEq(mockToken.balanceOf(address(quizManager)), 0);
    }

    function testCancelQuizETH() public {
        string memory quizId = "quiz-cancel";
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId, address(0), 1 ether);
        vm.prank(alice);
        quizManager.cancelQuiz(quizId);
        assertEq(alice.balance, 10 ether);
        HootQuizManagerV2.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManagerV2.QuizStatus.Cancelled));
    }
}



