// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {QuizManagerBase} from "./base/QuizManagerBase.sol";

/**
 * @title HootProgressiveQuizManager
 * @dev Manages quiz prize pools with progressive per-question distribution
 * Distributes prizes after each question rather than at quiz completion
 */
contract HootProgressiveQuizManager is QuizManagerBase {

    enum QuizStatus {
        Pending,
        Active,
        Completed,
        Cancelled
    }

    struct Quiz {
        string quizId;
        address creator;
        address prizeToken; // address(0) for ETH
        uint256 prizeAmount;
        uint256 totalQuestions;
        QuizStatus status;
        uint256 questionsProcessed;
        uint256 totalDistributed;
        address[3] winners;
    }

    mapping(string => Quiz) public quizzes;
    // Track cumulative prizes distributed to each player
    mapping(string => mapping(address => uint256)) public playerCumulativePrizes;

    

    // Progressive distribution ratios (1st: 40%, 2nd: 30%, 3rd: 20%, treasury: 10%)
    uint256 public constant FIRST_PLACE_RATIO = 400000;  // 40% in basis points
    uint256 public constant SECOND_PLACE_RATIO = 300000; // 30% in basis points
    uint256 public constant THIRD_PLACE_RATIO = 200000;  // 20% in basis points
    uint256 public constant TREASURY_RATIO = 100000;     // 10% in basis points

    event QuizCreated(
        string indexed quizId,
        address indexed creator,
        address prizeToken,
        uint256 prizeAmount,
        uint256 totalQuestions
    );

    event QuestionPrizeDistributed(
        string indexed quizId,
        uint256 questionIndex,
        address[3] winners,
        uint256[3] amounts,
        uint256 treasuryAmount
    );

    event PrizeDistributed(
        string indexed quizId,
        address[] winners,
        uint256[] amounts,
        uint256 treasuryAmount
    );

    

    
    error InvalidTotalQuestions();
    error AllQuestionsProcessed();

    constructor(address _treasury, uint256 _treasuryFeePercent, uint256 _feePrecision)
        QuizManagerBase(_treasury, _treasuryFeePercent, _feePrecision)
    {}

    /**
     * @dev Modifier to check if caller is owner or quiz distributor
     */
    

    /**
     * @dev Create a new progressive quiz with prize pool
     * @param quizId Unique identifier for the quiz
     * @param prizeToken Token address (address(0) for ETH)
     * @param prizeAmount Amount of tokens/ETH for prize pool
     * @param totalQuestions Total number of questions in the quiz
     */
    function createQuiz(
        string memory quizId,
        address prizeToken,
        uint256 prizeAmount,
        uint256 totalQuestions
    ) external payable nonReentrant {
        if (prizeAmount == 0) revert InvalidPrizeAmount();
        if (totalQuestions == 0) revert InvalidTotalQuestions();
        if (bytes(quizzes[quizId].quizId).length > 0) revert QuizNotFound();
        _collectFunds(prizeToken, prizeAmount);

        quizzes[quizId] = Quiz({
            quizId: quizId,
            creator: msg.sender,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            totalQuestions: totalQuestions,
            status: QuizStatus.Pending,
            questionsProcessed: 0,
            totalDistributed: 0,
            winners: [address(0), address(0), address(0)]
        });

        // Set the creator as the distributor for this quiz
        quizDistributors[quizId] = msg.sender;

        emit QuizCreated(quizId, msg.sender, prizeToken, prizeAmount, totalQuestions);
    }

    /**
     * @dev Distribute prizes for a single question (called after each question)
     * @param quizId Quiz identifier
     * @param winners Array of top 3 winners for this question [1st, 2nd, 3rd]
     */
    function distributeQuestionPrize(
        string memory quizId,
        address[3] memory winners
    ) external nonReentrant onlyOwnerOrQuizzDistributor(quizId) {
        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.questionsProcessed >= quiz.totalQuestions) revert AllQuestionsProcessed();

        // Calculate prize per question
        uint256 questionPrize = quiz.prizeAmount / quiz.totalQuestions;

        // Calculate amounts for each position
        uint256 firstPlaceAmount = (questionPrize * FIRST_PLACE_RATIO) / feePrecision;
        uint256 secondPlaceAmount = (questionPrize * SECOND_PLACE_RATIO) / feePrecision;
        uint256 thirdPlaceAmount = (questionPrize * THIRD_PLACE_RATIO) / feePrecision;
        uint256 treasuryAmount = (questionPrize * TREASURY_RATIO) / feePrecision;

        // Adjust for rounding errors - ensure total equals question prize
        uint256 totalCalculated = firstPlaceAmount + secondPlaceAmount + thirdPlaceAmount + treasuryAmount;
        if (totalCalculated != questionPrize) {
            // Add rounding difference to first place
            firstPlaceAmount += (questionPrize - totalCalculated);
        }

        // Track cumulative prizes for players
        if (winners[0] != address(0)) {
            playerCumulativePrizes[quizId][winners[0]] += firstPlaceAmount;
        }
        if (winners[1] != address(0)) {
            playerCumulativePrizes[quizId][winners[1]] += secondPlaceAmount;
        }
        if (winners[2] != address(0)) {
            playerCumulativePrizes[quizId][winners[2]] += thirdPlaceAmount;
        }

        // Distribute prizes
        if (winners[0] != address(0) && firstPlaceAmount > 0) {
            emit WinnerTransfer(winners[0], firstPlaceAmount, 1);
            _safeTransfer(quiz.prizeToken, winners[0], firstPlaceAmount);
            emit WinnerTransferSuccess(winners[0], firstPlaceAmount, 1);
        }

        if (winners[1] != address(0) && secondPlaceAmount > 0) {
            emit WinnerTransfer(winners[1], secondPlaceAmount, 2);
            _safeTransfer(quiz.prizeToken, winners[1], secondPlaceAmount);
            emit WinnerTransferSuccess(winners[1], secondPlaceAmount, 2);
        }

        if (winners[2] != address(0) && thirdPlaceAmount > 0) {
            emit WinnerTransfer(winners[2], thirdPlaceAmount, 3);
            _safeTransfer(quiz.prizeToken, winners[2], thirdPlaceAmount);
            emit WinnerTransferSuccess(winners[2], thirdPlaceAmount, 3);
        }

        // Transfer treasury fee
        _transferToTreasury(quiz.prizeToken, treasuryAmount);

        // Update quiz progress
        quiz.questionsProcessed += 1;
        quiz.totalDistributed += questionPrize;

        emit QuestionPrizeDistributed(
            quizId,
            quiz.questionsProcessed,
            winners,
            [firstPlaceAmount, secondPlaceAmount, thirdPlaceAmount],
            treasuryAmount
        );

        // Mark quiz as completed if all questions processed
        if (quiz.questionsProcessed >= quiz.totalQuestions) {
            quiz.status = QuizStatus.Completed;
            quiz.winners = winners; // Store final winners
        }
    }

    /**
     * @dev Get cumulative prize for a player in a quiz
     * @param quizId Quiz identifier
     * @param player Player address
     * @return uint256 Total prize earned by player
     */
    function getPlayerCumulativePrize(string memory quizId, address player) external view returns (uint256) {
        return playerCumulativePrizes[quizId][player];
    }

    /**
     * @dev Cancel quiz and return remaining prize to creator
     * @param quizId Quiz identifier
     */
    function cancelQuiz(string memory quizId) external nonReentrant override {
        Quiz storage quiz = quizzes[quizId];

        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status == QuizStatus.Completed) revert QuizAlreadyCompleted();

        quiz.status = QuizStatus.Cancelled;

        uint256 remainingPrize = quiz.prizeAmount - quiz.totalDistributed;

        if (remainingPrize > 0) {
            _safeTransfer(quiz.prizeToken, quiz.creator, remainingPrize);
        }

        emit QuizCancelled(quizId, quiz.creator);
    }

    /**
     * @dev Set the treasury address
     * @param newTreasury New treasury address
     */
    /**
     * @dev Set quiz status to active (called when game starts)
     * @param quizId Quiz identifier
     */
    function setQuizActive(string calldata quizId) external override {
        Quiz storage quiz = quizzes[quizId];

        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status != QuizStatus.Pending) revert QuizNotActive();

        quiz.status = QuizStatus.Active;
    }

    /**
     * @dev Get quiz information
     * @param quizId Quiz identifier
     * @return Quiz struct
     */
    function getQuiz(string memory quizId) external view returns (Quiz memory) {
        if (bytes(quizzes[quizId].quizId).length == 0) revert QuizNotFound();
        return quizzes[quizId];
    }

    /**
     * @dev Check if quiz exists
     * @param quizId Quiz identifier
     * @return bool
     */
    function quizExists(string calldata quizId) external view override returns (bool) {
        return bytes(quizzes[quizId].quizId).length > 0;
    }
}