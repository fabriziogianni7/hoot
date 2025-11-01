// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HootProgressiveQuizManager
 * @dev Manages quiz prize pools with progressive per-question distribution
 * Distributes prizes after each question rather than at quiz completion
 */
contract HootProgressiveQuizManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    mapping(string => address) public quizDistributors;
    // Track cumulative prizes distributed to each player
    mapping(string => mapping(address => uint256)) public playerCumulativePrizes;

    address public treasury;
    uint256 public treasuryFeePercent; // Fee in basis points (10000 = 1%, 1000000 = 100%)
    uint256 public feePrecision; // Precision denominator for fee calculation (default: 1000000 = 4 decimals)

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

    event PrizeDistributionStarted(
        string indexed quizId,
        address[] winners,
        uint256[] amounts,
        uint256 treasuryAmount
    );

    event PrizeCalculations(
        uint256 totalPrize,
        uint256 treasuryFee,
        uint256[] prizeAmounts
    );

    event TreasuryTransfer(
        address treasury,
        uint256 amount
    );

    event TreasuryTransferSuccess(
        address treasury,
        uint256 amount
    );

    event WinnerTransfer(
        address winner,
        uint256 amount,
        uint256 position
    );

    event WinnerTransferSuccess(
        address winner,
        uint256 amount,
        uint256 position
    );

    event QuizCancelled(string indexed quizId, address indexed creator);

    event TreasuryUpdated(address indexed newTreasury);

    event TreasuryFeePercentUpdated(uint256 newFeePercent);

    event FeePrecisionUpdated(uint256 newPrecision);

    error QuizNotFound();
    error QuizNotActive();
    error QuizAlreadyCompleted();
    error UnauthorizedDistributor();
    error InvalidPrizeAmount();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidWinnersCount();
    error InvalidArrayLength();
    error InvalidTreasuryFeePercent();
    error InvalidFeePrecision();
    error InvalidTotalQuestions();
    error AllQuestionsProcessed();

    constructor(address _treasury, uint256 _treasuryFeePercent, uint256 _feePrecision) Ownable(msg.sender) {
        if (_feePrecision == 0) revert InvalidFeePrecision();
        if (_treasuryFeePercent > _feePrecision) revert InvalidTreasuryFeePercent(); // Fee can't exceed 100%

        treasury = _treasury;
        treasuryFeePercent = _treasuryFeePercent;
        feePrecision = _feePrecision;
    }

    /**
     * @dev Modifier to check if caller is owner or quiz distributor
     */
    modifier onlyOwnerOrQuizzDistributor(string memory quizId) {
        if (msg.sender != owner() && msg.sender != quizDistributors[quizId]) {
            revert UnauthorizedDistributor();
        }
        _;
    }

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

        // Check if quiz already exists
        if (bytes(quizzes[quizId].quizId).length > 0) {
            revert QuizNotFound();
        }

        if (prizeToken == address(0)) {
            // ETH prize
            if (msg.value != prizeAmount) revert InvalidPrizeAmount();
        } else {
            // ERC20 prize
            if (msg.value > 0) revert InvalidPrizeAmount();

            IERC20 token = IERC20(prizeToken);
            if (token.balanceOf(msg.sender) < prizeAmount) revert InsufficientBalance();
            if (token.allowance(msg.sender, address(this)) < prizeAmount) revert InsufficientBalance();

            // Transfer tokens from creator to contract
            token.safeTransferFrom(msg.sender, address(this), prizeAmount);
        }

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

            if (quiz.prizeToken == address(0)) {
                // ETH transfer
                (bool success, ) = winners[0].call{value: firstPlaceAmount}("");
                if (!success) revert TransferFailed();
            } else {
                // ERC20 transfer
                IERC20(quiz.prizeToken).safeTransfer(winners[0], firstPlaceAmount);
            }

            emit WinnerTransferSuccess(winners[0], firstPlaceAmount, 1);
        }

        if (winners[1] != address(0) && secondPlaceAmount > 0) {
            emit WinnerTransfer(winners[1], secondPlaceAmount, 2);

            if (quiz.prizeToken == address(0)) {
                // ETH transfer
                (bool success, ) = winners[1].call{value: secondPlaceAmount}("");
                if (!success) revert TransferFailed();
            } else {
                // ERC20 transfer
                IERC20(quiz.prizeToken).safeTransfer(winners[1], secondPlaceAmount);
            }

            emit WinnerTransferSuccess(winners[1], secondPlaceAmount, 2);
        }

        if (winners[2] != address(0) && thirdPlaceAmount > 0) {
            emit WinnerTransfer(winners[2], thirdPlaceAmount, 3);

            if (quiz.prizeToken == address(0)) {
                // ETH transfer
                (bool success, ) = winners[2].call{value: thirdPlaceAmount}("");
                if (!success) revert TransferFailed();
            } else {
                // ERC20 transfer
                IERC20(quiz.prizeToken).safeTransfer(winners[2], thirdPlaceAmount);
            }

            emit WinnerTransferSuccess(winners[2], thirdPlaceAmount, 3);
        }

        // Transfer treasury fee
        if (treasuryAmount > 0 && treasury != address(0)) {
            emit TreasuryTransfer(treasury, treasuryAmount);

            if (quiz.prizeToken == address(0)) {
                // ETH transfer
                (bool treasurySuccess, ) = treasury.call{value: treasuryAmount}("");
                if (!treasurySuccess) revert TransferFailed();
            } else {
                // ERC20 transfer
                IERC20(quiz.prizeToken).safeTransfer(treasury, treasuryAmount);
            }

            emit TreasuryTransferSuccess(treasury, treasuryAmount);
        }

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
    function cancelQuiz(string memory quizId) external nonReentrant {
        Quiz storage quiz = quizzes[quizId];

        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status == QuizStatus.Completed) revert QuizAlreadyCompleted();

        quiz.status = QuizStatus.Cancelled;

        uint256 remainingPrize = quiz.prizeAmount - quiz.totalDistributed;

        if (remainingPrize > 0) {
            if (quiz.prizeToken == address(0)) {
                // Return ETH
                (bool success, ) = quiz.creator.call{value: remainingPrize}("");
                if (!success) revert TransferFailed();
            } else {
                // Return ERC20 tokens
                IERC20(quiz.prizeToken).safeTransfer(quiz.creator, remainingPrize);
            }
        }

        emit QuizCancelled(quizId, quiz.creator);
    }

    /**
     * @dev Set the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Get the treasury address
     * @return address Treasury address
     */
    function getTreasury() external view returns (address) {
        return treasury;
    }

    /**
     * @dev Set the treasury fee percentage
     * @param newFeePercent New fee percentage in basis points (relative to feePrecision)
     */
    function setTreasuryFeePercent(uint256 newFeePercent) external onlyOwner {
        if (newFeePercent > feePrecision) revert InvalidTreasuryFeePercent(); // Max 100%
        treasuryFeePercent = newFeePercent;
        emit TreasuryFeePercentUpdated(newFeePercent);
    }

    /**
     * @dev Get the treasury fee percentage
     * @return uint256 Fee percentage in basis points
     */
    function getTreasuryFeePercent() external view returns (uint256) {
        return treasuryFeePercent;
    }

    /**
     * @dev Set the fee precision (denominator for fee calculation)
     * @param newPrecision New precision value (must be > 0)
     */
    function setFeePrecision(uint256 newPrecision) external onlyOwner {
        if (newPrecision == 0) revert InvalidFeePrecision();
        // Validate that current fee percent doesn't exceed new precision
        if (treasuryFeePercent > newPrecision) revert InvalidTreasuryFeePercent();

        feePrecision = newPrecision;
        emit FeePrecisionUpdated(newPrecision);
    }

    /**
     * @dev Get the fee precision
     * @return uint256 Current fee precision (denominator)
     */
    function getFeePrecision() external view returns (uint256) {
        return feePrecision;
    }

    /**
     * @dev Set quiz status to active (called when game starts)
     * @param quizId Quiz identifier
     */
    function setQuizActive(string memory quizId) external {
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
    function quizExists(string memory quizId) external view returns (bool) {
        return bytes(quizzes[quizId].quizId).length > 0;
    }
}