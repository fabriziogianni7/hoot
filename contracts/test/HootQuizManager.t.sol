// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HootQuizManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract HootQuizManagerTest is Test {
    HootQuizManager public quizManager;
    MockERC20 public mockToken;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public treasury;

    function setUp() public {
        treasury = makeAddr("treasury");
        quizManager = new HootQuizManager(treasury);
        mockToken = new MockERC20();
        
        // Fund test accounts
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
        
        // Transfer tokens to test accounts
        mockToken.transfer(alice, 1000 * 10**18);
        mockToken.transfer(bob, 1000 * 10**18);
        mockToken.transfer(charlie, 1000 * 10**18);
    }

    function testCreateETHQuiz() public {
        string memory quizId = "test-quiz-1";
        uint256 prizeAmount = 1 ether;
        
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertEq(quiz.quizId, quizId);
        assertEq(quiz.creator, alice);
        assertEq(quiz.prizeToken, address(0));
        assertEq(quiz.prizeAmount, prizeAmount);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Pending));
    }

    function testCreateERC20Quiz() public {
        string memory quizId = "test-quiz-2";
        uint256 prizeAmount = 100 * 10**18;
        
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        vm.stopPrank();
        
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertEq(quiz.quizId, quizId);
        assertEq(quiz.creator, alice);
        assertEq(quiz.prizeToken, address(mockToken));
        assertEq(quiz.prizeAmount, prizeAmount);
    }

    function testDistributePrize() public {
        string memory quizId = "test-quiz-3";
        uint256 prizeAmount = 1 ether;
        
        // Create quiz
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        // Set quiz status to Active
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        
        // Distribute prizes
        address[4] memory winners = [alice, bob, charlie, treasury];
        uint256[4] memory amounts = [
            uint256(0.4 ether),  // 1st place
            uint256(0.3 ether),  // 2nd place  
            uint256(0.2 ether),  // 3rd place
            uint256(0.1 ether)   // treasury
        ];
        
        vm.prank(alice); // Alice is the quiz creator and distributor
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Check final balances
        // Alice: 10 ether - 1 ether (deposited) + 0.4 ether (40% of prize) = 9.4 ether
        assertEq(alice.balance, 9.4 ether);
        // Bob: 10 ether + 0.3 ether (30% of prize) = 10.3 ether
        assertEq(bob.balance, 10.3 ether);
        // Charlie: 10 ether + 0.2 ether (20% of prize) = 10.2 ether
        assertEq(charlie.balance, 10.2 ether);
        
        // Quiz status remains Active since distributePrize only distributes prizes
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Active));
    }

    function testTreasuryFeeDistribution() public {
        string memory quizId = "test-quiz-treasury";
        uint256 prizeAmount = 1 ether;
        address treasury = quizManager.treasury();
        
        // Create quiz
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        // Set quiz status to Active
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        
        // Record initial treasury balance
        uint256 initialTreasuryBalance = treasury.balance;
        
        // Distribute prizes
        address[4] memory winners = [alice, bob, charlie, treasury];
        uint256[4] memory amounts = [
            uint256(0.4 ether),  // 1st place
            uint256(0.3 ether),  // 2nd place  
            uint256(0.2 ether),  // 3rd place
            uint256(0.1 ether)   // treasury
        ];
        
        vm.prank(alice); // Alice is the quiz creator and distributor
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Check treasury received 10% fee (0.1 ether)
        assertEq(treasury.balance, initialTreasuryBalance + 0.1 ether);
    }

    function testCancelQuiz() public {
        string memory quizId = "test-quiz-4";
        uint256 prizeAmount = 1 ether;
        
        // Create quiz
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        // Cancel quiz
        vm.prank(alice);
        quizManager.cancelQuiz(quizId);
        
        // Check that ETH was returned
        assertEq(alice.balance, 10 ether);
        
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Cancelled));
    }

    function testOnlyDistributorCanDistribute() public {
        string memory quizId = "test-quiz-5";
        uint256 prizeAmount = 1 ether;
        
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        // Set quiz status to Active
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        
        address[4] memory winners = [alice, bob, charlie, treasury];
        uint256[4] memory amounts = [
            uint256(0.4 ether),  // 1st place
            uint256(0.3 ether),  // 2nd place  
            uint256(0.2 ether),  // 3rd place
            uint256(0.1 ether)   // treasury
        ];
        
        // Try to distribute as non-distributor (bob is not the distributor for this quiz)
        vm.prank(bob);
        vm.expectRevert(HootQuizManager.UnauthorizedDistributor.selector);
        quizManager.distributePrize(quizId, winners, amounts);
    }

    function testQuizNotFound() public {
        string memory quizId = "non-existent";
        
        vm.expectRevert(HootQuizManager.QuizNotFound.selector);
        quizManager.getQuiz(quizId);
    }
}
