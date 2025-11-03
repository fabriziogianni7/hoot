// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {QuizManagerBase} from "./base/QuizManagerBase.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HootBonusQuizManager
 * @dev Manages quiz prize pools with bonus golden question logic
 * Extends HootQuizManager with extra bounty distribution for golden questions
 */
contract HootBonusQuizManager is QuizManagerBase {
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
        uint256 extraBountyAmount;
        QuizStatus status;
        address[3] winners;
    }

    mapping(string => Quiz) public quizzes;
    mapping(string => bool) public goldenQuestionsAnsweredCorrectly;

    

    event QuizCreated(
        string indexed quizId,
        address indexed creator,
        address prizeToken,
        uint256 prizeAmount,
        uint256 extraBountyAmount
    );

    event ExtraBountyDeposited(
        string indexed quizId,
        address indexed depositor,
        uint256 amount
    );

    event GoldenQuestionsResult(
        string indexed quizId,
        bool allCorrect,
        uint256 extraBountyDistributed,
        uint256 treasuryAmount
    );

    event PrizeDistributed(
        string indexed quizId,
        address[] winners,
        uint256[] amounts,
        uint256 treasuryAmount,
        uint256 extraBountyDistributed
    );

    

    
    error ExtraBountyAlreadyDeposited();

    constructor(address _treasury, uint256 _treasuryFeePercent, uint256 _feePrecision)
        QuizManagerBase(_treasury, _treasuryFeePercent, _feePrecision)
    {}

    /**
     * @dev Create a new bonus quiz with prize pool
     * @param quizId Unique identifier for the quiz
     * @param prizeToken Token address (address(0) for ETH)
     * @param prizeAmount Amount of tokens/ETH for base prize pool
     */
    function createQuiz(
        string memory quizId,
        address prizeToken,
        uint256 prizeAmount,
        uint256 extraBountyAmount
    ) external payable nonReentrant {
        if (prizeAmount == 0) revert InvalidPrizeAmount();
        if (bytes(quizzes[quizId].quizId).length > 0) revert QuizNotFound();

        uint256 totalAmount = prizeAmount + extraBountyAmount;
        if (prizeToken == address(0)) {
            if (msg.value != totalAmount) revert InvalidPrizeAmount();
        } else {
            if (msg.value > 0) revert InvalidPrizeAmount();
            IERC20 token = IERC20(prizeToken);
            if (token.balanceOf(msg.sender) < totalAmount) revert InsufficientBalance();
            if (token.allowance(msg.sender, address(this)) < totalAmount) revert InsufficientBalance();
            token.safeTransferFrom(msg.sender, address(this), totalAmount);
        }

        quizzes[quizId] = Quiz({
            quizId: quizId,
            creator: msg.sender,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            extraBountyAmount: extraBountyAmount,
            status: QuizStatus.Pending,
            winners: [address(0), address(0), address(0)]
        });

        // Set the creator as the distributor for this quiz
        quizDistributors[quizId] = msg.sender;

        emit QuizCreated(quizId, msg.sender, prizeToken, prizeAmount, extraBountyAmount);
    }

    

    /**
     * @dev Set whether golden questions were answered correctly by all players
     * @param quizId Quiz identifier
     * @param allCorrect Whether all players answered golden questions correctly
     */
    function setGoldenQuestionsResult(string memory quizId, bool allCorrect) external onlyOwnerOrQuizzDistributor(quizId) {
        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();

        goldenQuestionsAnsweredCorrectly[quizId] = allCorrect;
    }

    /**
     * @dev Distribute prizes to winners with bonus logic
     * @param quizId Quiz identifier
     * @param winners Array of winner addresses (max 5)
     * @param amounts Array of prize amounts for each winner (max 5)
     */
    function distributePrize(
        string memory quizId,
        address[] memory winners,
        uint256[] memory amounts
    ) external nonReentrant onlyOwnerOrQuizzDistributor(quizId) {
        // Validate inputs
        if (winners.length == 0 || winners.length > 5) revert InvalidWinnersCount();
        if (winners.length != amounts.length) revert InvalidArrayLength();

        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();

        // Calculate total prize amount
        uint256 totalWinnersPrize = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalWinnersPrize += amounts[i];
        }

        // Calculate treasury fee with maximum precision
        uint256 treasuryAmount = (quiz.prizeAmount * treasuryFeePercent) / feePrecision;

        // Verify total doesn't exceed prize pool
        if (totalWinnersPrize + treasuryAmount > quiz.prizeAmount) revert InvalidPrizeAmount();

        // Log distribution details
        emit PrizeDistributionStarted(quizId, winners, amounts, treasuryAmount);

        // Log prize calculations
        emit PrizeCalculations(quiz.prizeAmount, treasuryAmount, amounts);

        // Golden bounty handled separately via distributeGoldenBounty

        // Distribute base prizes to winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && amounts[i] > 0) {
                emit WinnerTransfer(winners[i], amounts[i], i + 1);
                _safeTransfer(quiz.prizeToken, winners[i], amounts[i]);
                emit WinnerTransferSuccess(winners[i], amounts[i], i + 1);
            }
        }

        // Transfer treasury fee for base prize
        _transferToTreasury(quiz.prizeToken, treasuryAmount);

        // Update quiz status
        quiz.status = QuizStatus.Completed;

        emit PrizeDistributed(quizId, winners, amounts, treasuryAmount, 0);
    }

    /**
     * @dev Distribute extra bounty for the golden question to provided players.
     *      If no players are provided, sends full extra bounty to treasury (no fee).
     * @param quizId Quiz identifier
     * @param players Addresses eligible to receive the golden bounty
     */
    function distributeGoldenBounty(
        string memory quizId,
        address[] memory players
    ) external nonReentrant onlyOwnerOrQuizzDistributor(quizId) {
        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        uint256 bounty = quiz.extraBountyAmount;
        if (bounty == 0) revert InvalidPrizeAmount();

        uint256 extraBountyDistributed = 0;
        uint256 extraTreasuryAmount = 0;
        bool allCorrect = players.length > 0;

        if (allCorrect) {
            uint256 perPlayer = bounty / players.length;
            extraBountyDistributed = perPlayer * players.length;
            for (uint256 i = 0; i < players.length; i++) {
                if (players[i] != address(0) && perPlayer > 0) {
                    _safeTransfer(quiz.prizeToken, players[i], perPlayer);
                }
            }
            // remainder to treasury if any
            extraTreasuryAmount = bounty - extraBountyDistributed;
            if (extraTreasuryAmount > 0) {
                _transferToTreasury(quiz.prizeToken, extraTreasuryAmount);
            }
        } else {
            // No eligible players, send full to treasury
            extraTreasuryAmount = bounty;
            _transferToTreasury(quiz.prizeToken, extraTreasuryAmount);
        }

        // clear bounty
        quiz.extraBountyAmount = 0;

        emit GoldenQuestionsResult(quizId, allCorrect, extraBountyDistributed, extraTreasuryAmount);
    }

    /**
     * @dev Cancel quiz and return prize to creator
     * @param quizId Quiz identifier
     */
    function cancelQuiz(string memory quizId) external nonReentrant override {
        Quiz storage quiz = quizzes[quizId];

        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status == QuizStatus.Completed) revert QuizAlreadyCompleted();

        quiz.status = QuizStatus.Cancelled;

        uint256 totalReturn = quiz.prizeAmount + quiz.extraBountyAmount;

        _safeTransfer(quiz.prizeToken, quiz.creator, totalReturn);

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