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
    address public owner;
    
    uint256 constant FEE_PRECISION = 1000000; // 1M = 4 decimal precision
    uint256 constant TREASURY_FEE = 100000; // 10% fee

    function setUp() public {
        owner = address(this);
        treasury = makeAddr("treasury");
        
        // Deploy with 10% treasury fee and 1M precision
        quizManager = new HootQuizManager(treasury, TREASURY_FEE, FEE_PRECISION);
        mockToken = new MockERC20();
        
        // Fund test accounts
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
        vm.deal(treasury, 0 ether); // Start treasury at 0 for easier testing
        
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
        
        // Distribute prizes (treasury fee calculated automatically: 10% = 0.1 ether)
        // Winners get 90% total = 0.9 ether
        address[] memory winners = new address[](3);
        winners[0] = alice;
        winners[1] = bob;
        winners[2] = charlie;
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 0.45 ether;  // 1st place: 50% of winners pool
        amounts[1] = 0.27 ether;  // 2nd place: 30% of winners pool
        amounts[2] = 0.18 ether;  // 3rd place: 20% of winners pool
        // Total: 0.9 ether + 0.1 ether (treasury) = 1 ether
        
        vm.prank(alice); // Alice is the quiz creator and distributor
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Check final balances
        // Alice: 10 ether - 1 ether (deposited) + 0.45 ether = 9.45 ether
        assertEq(alice.balance, 9.45 ether);
        // Bob: 10 ether + 0.27 ether = 10.27 ether
        assertEq(bob.balance, 10.27 ether);
        // Charlie: 10 ether + 0.18 ether = 10.18 ether
        assertEq(charlie.balance, 10.18 ether);
        // Treasury: 0 ether + 0.1 ether (10% fee) = 0.1 ether
        assertEq(treasury.balance, 0.1 ether);
        
        // Quiz status should now be Completed
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Completed));
    }

    function testTreasuryFeeDistribution() public {
        string memory quizId = "test-quiz-treasury";
        uint256 prizeAmount = 1 ether;
        
        // Create quiz
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        // Set quiz status to Active
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        
        // Record initial treasury balance
        uint256 initialTreasuryBalance = treasury.balance;
        
        // Distribute prizes - treasury gets 10% automatically
        address[] memory winners = new address[](3);
        winners[0] = alice;
        winners[1] = bob;
        winners[2] = charlie;
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 0.5 ether;  // 1st place
        amounts[1] = 0.25 ether;  // 2nd place  
        amounts[2] = 0.15 ether; // 3rd place
        // Total: 0.9 ether, Treasury gets: 0.1 ether (10%)
        
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
        
        address[] memory winners = new address[](3);
        winners[0] = alice;
        winners[1] = bob;
        winners[2] = charlie;
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 0.45 ether;
        amounts[1] = 0.27 ether;
        amounts[2] = 0.18 ether;
        
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
    
    function testOwnerCanDistribute() public {
        string memory quizId = "test-quiz-owner";
        uint256 prizeAmount = 1 ether;
        
        vm.prank(alice);
        quizManager.createQuiz{value: prizeAmount}(quizId, address(0), prizeAmount);
        
        vm.prank(alice);
        quizManager.setQuizActive(quizId);
        
        address[] memory winners = new address[](2);
        winners[0] = bob;
        winners[1] = charlie;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.6 ether;
        amounts[1] = 0.3 ether;
        
        // Owner can distribute even though they didn't create the quiz
        quizManager.distributePrize(quizId, winners, amounts);
        
        assertEq(bob.balance, 10.6 ether);
        assertEq(charlie.balance, 10.3 ether);
        assertEq(treasury.balance, 0.1 ether);
    }
    
    function testVariableWinnersCount() public {
        // Test with 1 winner
        string memory quizId1 = "test-quiz-one-winner";
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId1, address(0), 1 ether);
        
        address[] memory winners1 = new address[](1);
        winners1[0] = bob;
        uint256[] memory amounts1 = new uint256[](1);
        amounts1[0] = 0.9 ether; // 90%, treasury gets 10%
        
        vm.prank(alice);
        quizManager.distributePrize(quizId1, winners1, amounts1);
        
        assertEq(bob.balance, 10.9 ether);
        
        // Test with 5 winners (max)
        string memory quizId5 = "test-quiz-five-winners";
        address dave = makeAddr("dave");
        address eve = makeAddr("eve");
        vm.deal(dave, 10 ether);
        vm.deal(eve, 10 ether);
        
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId5, address(0), 1 ether);
        
        address[] memory winners5 = new address[](5);
        winners5[0] = alice;
        winners5[1] = bob;
        winners5[2] = charlie;
        winners5[3] = dave;
        winners5[4] = eve;
        
        uint256[] memory amounts5 = new uint256[](5);
        amounts5[0] = 0.3 ether;
        amounts5[1] = 0.25 ether;
        amounts5[2] = 0.15 ether;
        amounts5[3] = 0.1 ether;
        amounts5[4] = 0.1 ether;
        
        vm.prank(alice);
        quizManager.distributePrize(quizId5, winners5, amounts5);
        
        // Alice: 10 - 2 (two quizzes) + 0.3 = 8.3
        assertEq(alice.balance, 8.3 ether);
        assertEq(dave.balance, 10.1 ether);
        assertEq(eve.balance, 10.1 ether);
    }
    
    function testInvalidWinnersCount() public {
        string memory quizId = "test-quiz-invalid";
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId, address(0), 1 ether);
        
        // Test with 0 winners
        address[] memory winners0 = new address[](0);
        uint256[] memory amounts0 = new uint256[](0);
        
        vm.prank(alice);
        vm.expectRevert(HootQuizManager.InvalidWinnersCount.selector);
        quizManager.distributePrize(quizId, winners0, amounts0);
        
        // Test with 6 winners (over max)
        address[] memory winners6 = new address[](6);
        uint256[] memory amounts6 = new uint256[](6);
        
        vm.prank(alice);
        vm.expectRevert(HootQuizManager.InvalidWinnersCount.selector);
        quizManager.distributePrize(quizId, winners6, amounts6);
    }
    
    function testArrayLengthMismatch() public {
        string memory quizId = "test-quiz-mismatch";
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId, address(0), 1 ether);
        
        address[] memory winners = new address[](3);
        uint256[] memory amounts = new uint256[](2); // Mismatched length
        
        vm.prank(alice);
        vm.expectRevert(HootQuizManager.InvalidArrayLength.selector);
        quizManager.distributePrize(quizId, winners, amounts);
    }
    
    function testSetFeePrecision() public {
        // Check initial precision
        assertEq(quizManager.getFeePrecision(), FEE_PRECISION);
        
        // First, reduce treasury fee to be compatible with lower precision
        // Current fee is 100000 (10% of 1M), we need to reduce it first
        uint256 newFee = 1000; // 10% of 10000
        quizManager.setTreasuryFeePercent(newFee);
        
        // Now update precision to lower value
        uint256 newPrecision = 10000; // 2 decimal precision
        quizManager.setFeePrecision(newPrecision);
        
        assertEq(quizManager.getFeePrecision(), newPrecision);
        assertEq(quizManager.getTreasuryFeePercent(), newFee);
    }
    
    function testSetFeePrecisionOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        quizManager.setFeePrecision(10000);
    }
    
    function testSetFeePrecisionZeroReverts() public {
        vm.expectRevert(HootQuizManager.InvalidFeePrecision.selector);
        quizManager.setFeePrecision(0);
    }
    
    function testSetFeePrecisionBelowFeeReverts() public {
        // Current fee is 100000, trying to set precision to 50000 should fail
        vm.expectRevert(HootQuizManager.InvalidTreasuryFeePercent.selector);
        quizManager.setFeePrecision(50000);
    }
    
    function testIncreasePrecision() public {
        // Increasing precision should work without issues
        uint256 newPrecision = 10000000; // 10M = 6 decimal precision
        quizManager.setFeePrecision(newPrecision);
        
        assertEq(quizManager.getFeePrecision(), newPrecision);
        
        // Treasury fee should still be valid
        assertEq(quizManager.getTreasuryFeePercent(), TREASURY_FEE);
    }
    
    function testSetTreasuryFeePercent() public {
        // Check initial fee (10%)
        assertEq(quizManager.getTreasuryFeePercent(), TREASURY_FEE);
        
        // Update fee to 5%
        uint256 newFee = 50000; // 5% with 1M precision
        quizManager.setTreasuryFeePercent(newFee);
        
        assertEq(quizManager.getTreasuryFeePercent(), newFee);
        
        // Test with new fee
        string memory quizId = "test-quiz-new-fee";
        vm.prank(alice);
        quizManager.createQuiz{value: 1 ether}(quizId, address(0), 1 ether);
        
        address[] memory winners = new address[](1);
        winners[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0.95 ether; // 95%, treasury gets 5%
        
        vm.prank(alice);
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Treasury should receive 5% = 0.05 ether
        assertEq(treasury.balance, 0.05 ether);
    }
    
    function testERC20Distribution() public {
        string memory quizId = "test-quiz-erc20";
        uint256 prizeAmount = 100 * 10**18;
        
        // Record initial balances
        uint256 aliceInitialBalance = mockToken.balanceOf(alice);
        uint256 bobInitialBalance = mockToken.balanceOf(bob);
        uint256 charlieInitialBalance = mockToken.balanceOf(charlie);
        uint256 treasuryInitialBalance = mockToken.balanceOf(treasury);
        
        // Alice creates quiz with ERC20 tokens
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        quizManager.setQuizActive(quizId);
        vm.stopPrank();
        
        // Verify tokens were transferred to contract
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - prizeAmount);
        assertEq(mockToken.balanceOf(address(quizManager)), prizeAmount);
        
        // Setup winners and amounts (90% to winners, 10% to treasury)
        address[] memory winners = new address[](3);
        winners[0] = bob;
        winners[1] = charlie;
        winners[2] = alice;
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 45 * 10**18;  // 45% to 1st place
        amounts[1] = 30 * 10**18;  // 30% to 2nd place
        amounts[2] = 15 * 10**18;  // 15% to 3rd place
        // Total: 90 * 10**18, Treasury: 10 * 10**18 (10%)
        
        // Distribute prizes
        vm.prank(alice);
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Check final balances
        assertEq(mockToken.balanceOf(bob), bobInitialBalance + 45 * 10**18);
        assertEq(mockToken.balanceOf(charlie), charlieInitialBalance + 30 * 10**18);
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - prizeAmount + 15 * 10**18);
        assertEq(mockToken.balanceOf(treasury), treasuryInitialBalance + 10 * 10**18);
        
        // Verify contract has no remaining tokens
        assertEq(mockToken.balanceOf(address(quizManager)), 0);
        
        // Verify quiz is completed
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Completed));
    }
    
    function testSetTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        quizManager.setTreasury(newTreasury);
        assertEq(quizManager.getTreasury(), newTreasury);
    }
    
    function testSetTreasuryOnlyOwner() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(alice);
        vm.expectRevert();
        quizManager.setTreasury(newTreasury);
    }
    
    function testERC20CancelQuiz() public {
        string memory quizId = "test-quiz-erc20-cancel";
        uint256 prizeAmount = 50 * 10**18;
        
        uint256 aliceInitialBalance = mockToken.balanceOf(alice);
        
        // Alice creates quiz with ERC20 tokens
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        
        // Verify tokens were transferred to contract
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - prizeAmount);
        assertEq(mockToken.balanceOf(address(quizManager)), prizeAmount);
        
        // Cancel quiz
        quizManager.cancelQuiz(quizId);
        vm.stopPrank();
        
        // Verify tokens were returned to alice
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance);
        assertEq(mockToken.balanceOf(address(quizManager)), 0);
        
        // Verify quiz is cancelled
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Cancelled));
    }
    
    function testERC20CreateAndDistributeFullFlow() public {
        string memory quizId = "test-quiz-erc20-full";
        uint256 prizeAmount = 200 * 10**18;
        
        // Record all initial balances
        uint256 aliceInitial = mockToken.balanceOf(alice);
        uint256 bobInitial = mockToken.balanceOf(bob);
        uint256 charlieInitial = mockToken.balanceOf(charlie);
        uint256 treasuryInitial = mockToken.balanceOf(treasury);
        
        // Step 1: Create quiz
        vm.startPrank(alice);
        mockToken.approve(address(quizManager), prizeAmount);
        quizManager.createQuiz(quizId, address(mockToken), prizeAmount);
        
        // Verify quiz was created
        HootQuizManager.Quiz memory quiz = quizManager.getQuiz(quizId);
        assertEq(quiz.creator, alice);
        assertEq(quiz.prizeToken, address(mockToken));
        assertEq(quiz.prizeAmount, prizeAmount);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Pending));
        
        // Step 2: Activate quiz
        quizManager.setQuizActive(quizId);
        quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Active));
        
        vm.stopPrank();
        
        // Step 3: Distribute prizes (5 winners)
        address dave = makeAddr("dave");
        address eve = makeAddr("eve");
        mockToken.transfer(dave, 100 * 10**18);
        mockToken.transfer(eve, 100 * 10**18);
        
        uint256 daveInitial = mockToken.balanceOf(dave);
        uint256 eveInitial = mockToken.balanceOf(eve);
        
        address[] memory winners = new address[](5);
        winners[0] = bob;
        winners[1] = charlie;
        winners[2] = dave;
        winners[3] = eve;
        winners[4] = alice;
        
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 70 * 10**18;   // 35% to 1st
        amounts[1] = 50 * 10**18;   // 25% to 2nd
        amounts[2] = 30 * 10**18;   // 15% to 3rd
        amounts[3] = 20 * 10**18;   // 10% to 4th
        amounts[4] = 10 * 10**18;   // 5% to 5th
        // Total: 180 * 10**18 (90%), Treasury: 20 * 10**18 (10%)
        
        vm.prank(alice);
        quizManager.distributePrize(quizId, winners, amounts);
        
        // Step 4: Verify all balances
        assertEq(mockToken.balanceOf(bob), bobInitial + 70 * 10**18);
        assertEq(mockToken.balanceOf(charlie), charlieInitial + 50 * 10**18);
        assertEq(mockToken.balanceOf(dave), daveInitial + 30 * 10**18);
        assertEq(mockToken.balanceOf(eve), eveInitial + 20 * 10**18);
        assertEq(mockToken.balanceOf(alice), aliceInitial - prizeAmount + 10 * 10**18);
        assertEq(mockToken.balanceOf(treasury), treasuryInitial + 20 * 10**18);
        
        // Verify contract has no remaining tokens
        assertEq(mockToken.balanceOf(address(quizManager)), 0);
        
        // Verify quiz is completed
        quiz = quizManager.getQuiz(quizId);
        assertTrue(uint256(quiz.status) == uint256(HootQuizManager.QuizStatus.Completed));
    }
}
