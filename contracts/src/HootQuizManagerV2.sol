// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {QuizManagerBase} from "./base/QuizManagerBase.sol";
import {IQuizManager} from "./interfaces/IQuizManager.sol";

/// @title HootQuizManagerV2
/// @notice Base quiz manager using shared QuizManagerBase utilities
contract HootQuizManagerV2 is QuizManagerBase {
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
        QuizStatus status;
        address[3] winners;
    }

    // storage
    mapping(string => Quiz) public quizzes;

    // Events mirroring V1
    event QuizCreated(
        string indexed quizId,
        address indexed creator,
        address prizeToken,
        uint256 prizeAmount
    );

    event PrizeDistributed(
        string indexed quizId,
        address[] winners,
        uint256[] amounts,
        uint256 treasuryAmount
    );

    constructor(address _treasury, uint256 _treasuryFeePercent, uint256 _feePrecision)
        QuizManagerBase(_treasury, _treasuryFeePercent, _feePrecision)
    {}

    /// @notice Create a new quiz with prize pool
    function createQuiz(
        string memory quizId,
        address prizeToken,
        uint256 prizeAmount
    ) external payable nonReentrant {
        if (prizeAmount == 0) revert InvalidPrizeAmount();
        if (bytes(quizzes[quizId].quizId).length > 0) {
            // Match V1 behavior (reused error name)
            revert QuizNotFound();
        }

        _collectFunds(prizeToken, prizeAmount);

        quizzes[quizId] = Quiz({
            quizId: quizId,
            creator: msg.sender,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            status: QuizStatus.Pending,
            winners: [address(0), address(0), address(0)]
        });

        // Set creator as distributor
        quizDistributors[quizId] = msg.sender;

        emit QuizCreated(quizId, msg.sender, prizeToken, prizeAmount);
    }

    /// @notice Distribute prizes to winners and treasury
    function distributePrize(
        string memory quizId,
        address[] memory winners,
        uint256[] memory amounts
    ) external nonReentrant onlyOwnerOrQuizzDistributor(quizId) {
        if (winners.length == 0 || winners.length > 5) revert InvalidWinnersCount();
        if (winners.length != amounts.length) revert InvalidArrayLength();

        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();

        uint256 totalWinnersPrize = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalWinnersPrize += amounts[i];
        }

        uint256 treasuryAmount = (quiz.prizeAmount * treasuryFeePercent) / feePrecision;
        if (totalWinnersPrize + treasuryAmount > quiz.prizeAmount) revert InvalidPrizeAmount();

        emit PrizeDistributionStarted(quizId, winners, amounts, treasuryAmount);
        emit PrizeCalculations(quiz.prizeAmount, treasuryAmount, amounts);

        // payout winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && amounts[i] > 0) {
                emit WinnerTransfer(winners[i], amounts[i], i + 1);
                _safeTransfer(quiz.prizeToken, winners[i], amounts[i]);
                emit WinnerTransferSuccess(winners[i], amounts[i], i + 1);
            }
        }

        // treasury
        _transferToTreasury(quiz.prizeToken, treasuryAmount);

        quiz.status = QuizStatus.Completed;
        emit PrizeDistributed(quizId, winners, amounts, treasuryAmount);
    }

    /// @notice Cancel quiz and return prize to creator
    function cancelQuiz(string memory quizId) external nonReentrant override {
        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status == QuizStatus.Completed) revert QuizAlreadyCompleted();

        quiz.status = QuizStatus.Cancelled;
        _safeTransfer(quiz.prizeToken, quiz.creator, quiz.prizeAmount);
        emit QuizCancelled(quizId, quiz.creator);
    }

    /// @notice Set a quiz active
    function setQuizActive(string calldata quizId) external override {
        Quiz storage quiz = quizzes[quizId];
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status != QuizStatus.Pending) revert QuizNotActive();
        quiz.status = QuizStatus.Active;
    }

    /// @notice Return quiz by id
    function getQuiz(string memory quizId) external view returns (Quiz memory) {
        if (bytes(quizzes[quizId].quizId).length == 0) revert QuizNotFound();
        return quizzes[quizId];
    }

    /// @inheritdoc IQuizManager
    function quizExists(string calldata quizId) external view override returns (bool) {
        return bytes(quizzes[quizId].quizId).length > 0;
    }
}


