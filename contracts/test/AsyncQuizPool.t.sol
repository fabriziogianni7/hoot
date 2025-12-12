// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AsyncQuizPool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Async is ERC20 {
    constructor() ERC20("Mock Async", "MASYNC") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract AsyncQuizPoolTest is Test {
    AsyncQuizPool private pool;
    MockERC20Async private token;

    address private backend = makeAddr("backend");
    address private creator = makeAddr("creator");
    address private player1 = makeAddr("player1");
    address private player2 = makeAddr("player2");
    address private player3 = makeAddr("player3");
    address private player4 = makeAddr("player4");
    address private protocol = makeAddr("protocol");

    uint16 private constant CREATOR_FEE_BPS = 700; // 7%
    uint16 private constant PROTOCOL_FEE_BPS = 300; // 3%

    function setUp() public {
        pool = new AsyncQuizPool(protocol, CREATOR_FEE_BPS, PROTOCOL_FEE_BPS);
        token = new MockERC20Async();

        pool.grantAdminRole(backend);
        pool.setAllowedToken(address(token), true);

        vm.deal(player1, 100 ether);
        vm.deal(player2, 100 ether);
        vm.deal(player3, 100 ether);
        vm.deal(player4, 100 ether);
        vm.deal(creator, 1 ether); // small buffer to observe fee payout

        token.transfer(player1, 10_000 ether);
        token.transfer(player2, 10_000 ether);
        token.transfer(player3, 10_000 ether);
        token.transfer(player4, 10_000 ether);
    }

    function _createEthQuiz(uint256 baseBuyIn) internal returns (uint256 quizId, uint64 start, uint64 end) {
        start = uint64(block.timestamp + 10);
        end = start + 1 days;
        vm.prank(backend);
        quizId = pool.createQuiz(creator, address(0), baseBuyIn, start, end);
    }

    function _createTokenQuiz(uint256 baseBuyIn) internal returns (uint256 quizId, uint64 start, uint64 end) {
        start = uint64(block.timestamp + 10);
        end = start + 1 days;
        vm.prank(backend);
        quizId = pool.createQuiz(creator, address(token), baseBuyIn, start, end);
    }

    function testCreateQuizStoresParams() public {
        (uint256 quizId, uint64 start, uint64 end) = _createEthQuiz(1 ether);
        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertEq(quiz.creator, creator);
        assertEq(quiz.buyInToken, address(0));
        assertEq(quiz.baseBuyIn, 1 ether);
        assertEq(quiz.currentBuyIn, 1 ether);
        assertEq(quiz.startTime, start);
        assertEq(quiz.endTime, end);
        assertEq(quiz.creatorFeeBps, CREATOR_FEE_BPS);
        assertEq(quiz.protocolFeeBps, PROTOCOL_FEE_BPS);
    }

    function testJoinQuizEthHappyPathUpdatesState() public {
        (uint256 quizId, uint64 start, ) = _createEthQuiz(1 ether);
        vm.warp(start + 1);

        vm.prank(player1);
        pool.joinQuiz{value: 1 ether}(quizId);

        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertEq(quiz.playersCount, 1);
        assertEq(quiz.prizePool, 1 ether);
        assertEq(quiz.currentBuyIn, (1 ether * 101) / 100);
        assertTrue(pool.hasJoined(quizId, player1));
    }

    function testJoinQuizIncrementsPriceSequentially() public {
        (uint256 quizId, uint64 start, ) = _createEthQuiz(1 ether);
        vm.warp(start + 1);

        uint256 price = 1 ether;
        vm.prank(player1);
        pool.joinQuiz{value: price}(quizId);
        price = (price * 101) / 100;

        vm.prank(player2);
        pool.joinQuiz{value: price}(quizId);
        price = (price * 101) / 100;

        vm.prank(player3);
        pool.joinQuiz{value: price}(quizId);

        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertEq(quiz.playersCount, 3);
        assertEq(quiz.prizePool, 1 ether + (1 ether * 101) / 100 + ( (1 ether * 101) / 100 * 101) / 100);
    }

    function testJoinQuizRejectsDuplicate() public {
        (uint256 quizId, uint64 start, ) = _createEthQuiz(1 ether);
        vm.warp(start + 1);

        vm.prank(player1);
        pool.joinQuiz{value: 1 ether}(quizId);

        vm.expectRevert(AsyncQuizPool.AlreadyJoined.selector);
        vm.prank(player1);
        pool.joinQuiz{value: (1 ether * 101) / 100}(quizId);
    }

    function testJoinQuizRejectsCreator() public {
        (uint256 quizId, uint64 start, ) = _createEthQuiz(1 ether);
        vm.warp(start + 1);

        vm.expectRevert(AsyncQuizPool.CreatorCannotJoin.selector);
        vm.prank(creator);
        pool.joinQuiz{value: 1 ether}(quizId);
    }

    function testJoinQuizRespectsTimeWindow() public {
        (uint256 quizId, uint64 start, uint64 end) = _createEthQuiz(1 ether);
        vm.warp(start - 1);
        vm.expectRevert(AsyncQuizPool.QuizNotStarted.selector);
        pool.joinQuiz{value: 1 ether}(quizId);

        vm.warp(end + 1);
        vm.expectRevert(AsyncQuizPool.QuizEnded.selector);
        pool.joinQuiz{value: 1 ether}(quizId);
    }

    function testJoinQuizWithERC20() public {
        (uint256 quizId, uint64 start, ) = _createTokenQuiz(5 ether);
        vm.warp(start + 1);

        vm.startPrank(player1);
        token.approve(address(pool), 5 ether);
        pool.joinQuiz(quizId);
        vm.stopPrank();

        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertEq(quiz.prizePool, 5 ether);
        assertEq(token.balanceOf(address(pool)), 5 ether);
    }

    function testFinalizeQuizFourWinnersEth() public {
        (uint256 quizId, uint64 start, uint64 end) = _createEthQuiz(1 ether);
        vm.warp(start + 1);

        address[4] memory players = [player1, player2, player3, player4];
        uint256[4] memory pays;
        pays[0] = 1 ether;
        for (uint256 i = 1; i < 4; i++) {
            pays[i] = (pays[i - 1] * 101) / 100;
        }

        for (uint256 i; i < 4; i++) {
            vm.prank(players[i]);
            pool.joinQuiz{value: pays[i]}(quizId);
        }

        AsyncQuizPool.Quiz memory quizBefore = pool.getQuiz(quizId);
        uint256 prizePool = quizBefore.prizePool;
        uint256 winnersTotal = (prizePool * (10_000 - CREATOR_FEE_BPS - PROTOCOL_FEE_BPS)) / 10_000;
        uint256 creatorFee = (prizePool * CREATOR_FEE_BPS) / 10_000;
        uint256 protocolFee = (prizePool * PROTOCOL_FEE_BPS) / 10_000;

        uint256[4] memory preBalances = [
            player1.balance,
            player2.balance,
            player3.balance,
            player4.balance
        ];
        uint256 preCreator = creator.balance;
        uint256 preProtocol = protocol.balance;

        vm.warp(end + 1);

        address[] memory winners = new address[](4);
        winners[0] = player1;
        winners[1] = player2;
        winners[2] = player3;
        winners[3] = player4;

        vm.prank(backend);
        pool.finalizeQuiz(quizId, winners);

        uint256[4] memory shares;
        shares[0] = (winnersTotal * 40) / 100;
        shares[1] = (winnersTotal * 30) / 100;
        shares[2] = (winnersTotal * 20) / 100;
        shares[3] = winnersTotal - shares[0] - shares[1] - shares[2];

        assertEq(player1.balance, preBalances[0] + shares[0]);
        assertEq(player2.balance, preBalances[1] + shares[1]);
        assertEq(player3.balance, preBalances[2] + shares[2]);
        assertEq(player4.balance, preBalances[3] + shares[3]);
        assertEq(creator.balance, preCreator + creatorFee);
        assertEq(protocol.balance, preProtocol + protocolFee);

        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertTrue(quiz.finalized);
        assertEq(uint256(quiz.status), uint256(AsyncQuizPool.QuizStatus.Finalized));
    }

    function testFinalizeQuizRenormalizesForFewerWinners() public {
        (uint256 quizId, uint64 start, uint64 end) = _createTokenQuiz(10 ether);
        vm.warp(start + 1);

        vm.startPrank(player1);
        token.approve(address(pool), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(player2);
        token.approve(address(pool), type(uint256).max);
        vm.stopPrank();

        // two joins
        vm.prank(player1);
        pool.joinQuiz(quizId);
        vm.prank(player2);
        pool.joinQuiz(quizId);

        uint256 prizePool = token.balanceOf(address(pool));
        uint256 winnersFeeBps = 10_000 - CREATOR_FEE_BPS - PROTOCOL_FEE_BPS; // 90%
        uint256 winnersTotal = (prizePool * winnersFeeBps) / 10_000;

        vm.warp(end + 1);
        uint256 preP1 = token.balanceOf(player1);
        uint256 preP2 = token.balanceOf(player2);
        address[] memory winners = new address[](2);
        winners[0] = player1;
        winners[1] = player2;

        vm.prank(backend);
        pool.finalizeQuiz(quizId, winners);

        // Ratios renormalized: 40/30 -> 57.14% / 42.86%
        uint256 sumRatios = 40 + 30;
        uint256 expectedP1 = preP1 + (winnersTotal * 40) / sumRatios;
        uint256 expectedP2 = preP2 + winnersTotal - (winnersTotal * 40) / sumRatios;

        assertEq(token.balanceOf(player1), expectedP1);
        assertEq(token.balanceOf(player2), expectedP2);

        AsyncQuizPool.Quiz memory quiz = pool.getQuiz(quizId);
        assertTrue(quiz.finalized);
    }

    function testFinalizeBeforeEndReverts() public {
        (uint256 quizId, uint64 start, ) = _createEthQuiz(1 ether);
        vm.warp(start + 1);
        vm.prank(player1);
        pool.joinQuiz{value: 1 ether}(quizId);

        address[] memory winners = new address[](1);
        winners[0] = player1;

        vm.expectRevert(AsyncQuizPool.QuizStillRunning.selector);
        vm.prank(backend);
        pool.finalizeQuiz(quizId, winners);
    }

    function testFinalizeRequiresWinnerJoined() public {
        (uint256 quizId, uint64 start, uint64 end) = _createEthQuiz(1 ether);
        vm.warp(start + 1);
        vm.prank(player1);
        pool.joinQuiz{value: 1 ether}(quizId);

        address[] memory winners = new address[](1);
        winners[0] = player2; // not joined

        vm.warp(end + 1);
        vm.prank(backend);
        vm.expectRevert(AsyncQuizPool.InvalidWinner.selector);
        pool.finalizeQuiz(quizId, winners);
    }

    function testFeesUpdateAffectsNewQuizzesOnly() public {
        (uint256 quizIdOld, , ) = _createEthQuiz(1 ether);
        pool.setFees(500, 200); // 5% + 2% for future quizzes
        (uint256 quizIdNew, , ) = _createEthQuiz(1 ether);

        AsyncQuizPool.Quiz memory oldQuiz = pool.getQuiz(quizIdOld);
        AsyncQuizPool.Quiz memory newQuiz = pool.getQuiz(quizIdNew);

        assertEq(oldQuiz.creatorFeeBps, CREATOR_FEE_BPS);
        assertEq(oldQuiz.protocolFeeBps, PROTOCOL_FEE_BPS);
        assertEq(newQuiz.creatorFeeBps, 500);
        assertEq(newQuiz.protocolFeeBps, 200);
    }
}

