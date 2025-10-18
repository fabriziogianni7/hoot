// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HootQuizManager
 * @dev Manages quiz prize pools with ETH and ERC20 token support
 */
contract HootQuizManager is Ownable, ReentrancyGuard {
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
        uint256[3] scores;
    }

    mapping(string => Quiz) public quizzes;
    mapping(string => address) public quizDistributors;
    address public treasury;

    event QuizCreated(
        string indexed quizId,
        address indexed creator,
        address prizeToken,
        uint256 prizeAmount
    );

    event PrizeDistributed(
        string indexed quizId,
        address[4] winners,
        uint256[4] amounts
    );

    event PrizeDistributionStarted(
        string indexed quizId,
        address[4] winners,
        uint256[4] amounts
    );

    event PrizeCalculations(
        uint256 totalPrize,
        uint256 treasuryFee,
        uint256[3] prizeAmounts
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

    error QuizNotFound();
    error QuizNotActive();
    error QuizAlreadyCompleted();
    error UnauthorizedDistributor();
    error InvalidPrizeAmount();
    error InsufficientBalance();
    error TransferFailed();

    constructor(address _treasury) Ownable(msg.sender) {
        treasury = _treasury;
    }

    /**
     * @dev Create a new quiz with prize pool
     * @param quizId Unique identifier for the quiz
     * @param prizeToken Token address (address(0) for ETH)
     * @param prizeAmount Amount of tokens/ETH for prize pool
     */
    function createQuiz(
        string memory quizId,
        address prizeToken,
        uint256 prizeAmount
    ) external payable nonReentrant {
        if (prizeAmount == 0) revert InvalidPrizeAmount();

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
            if (!token.transferFrom(msg.sender, address(this), prizeAmount)) {
                revert TransferFailed();
            }
        }

        quizzes[quizId] = Quiz({
            quizId: quizId,
            creator: msg.sender,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            status: QuizStatus.Pending,
            winners: [address(0), address(0), address(0)],
            scores: [uint256(0), uint256(0), uint256(0)]
        });

        // Set the creator as the distributor for this quiz
        quizDistributors[quizId] = msg.sender;

        emit QuizCreated(quizId, msg.sender, prizeToken, prizeAmount);
    }

    /**
     * @dev Distribute prizes to top 3 players and treasury
     * @param quizId Quiz identifier
     * @param winners Array of 4 addresses: [1st, 2nd, 3rd, treasury]
     * @param amounts Array of 4 amounts: [1st prize, 2nd prize, 3rd prize, treasury fee]
     */
    function distributePrize(
        string memory quizId,
        address[4] memory winners,
        uint256[4] memory amounts
    ) external nonReentrant {
        if (msg.sender != quizDistributors[quizId]) revert UnauthorizedDistributor();
        
        // Log distribution details
        emit PrizeDistributionStarted(quizId, winners, amounts);
        
        // Calculate total prize for logging
        uint256 totalPrize = amounts[0] + amounts[1] + amounts[2] + amounts[3];
        
        // Log prize calculations
        emit PrizeCalculations(totalPrize, amounts[3], [amounts[0], amounts[1], amounts[2]]);

        // Distribute ETH to all recipients
        for (uint256 i = 0; i < 4; i++) {
            if (winners[i] != address(0) && amounts[i] > 0) {
                if (i == 3) {
                    // Treasury transfer
                    emit TreasuryTransfer(winners[i], amounts[i]);
                    (bool treasurySuccess, ) = winners[i].call{value: amounts[i]}("");
                    if (!treasurySuccess) revert TransferFailed();
                    emit TreasuryTransferSuccess(winners[i], amounts[i]);
                } else {
                    // Winner transfer
                    emit WinnerTransfer(winners[i], amounts[i], i + 1);
                    (bool success, ) = winners[i].call{value: amounts[i]}("");
                    if (!success) revert TransferFailed();
                    emit WinnerTransferSuccess(winners[i], amounts[i], i + 1);
                }
            }
        }

        emit PrizeDistributed(quizId, winners, amounts);
    }

    /**
     * @dev Cancel quiz and return prize to creator
     * @param quizId Quiz identifier
     */
    function cancelQuiz(string memory quizId) external nonReentrant {
        Quiz storage quiz = quizzes[quizId];
        
        if (bytes(quiz.quizId).length == 0) revert QuizNotFound();
        if (quiz.creator != msg.sender) revert UnauthorizedDistributor();
        if (quiz.status == QuizStatus.Completed) revert QuizAlreadyCompleted();

        quiz.status = QuizStatus.Cancelled;

        if (quiz.prizeToken == address(0)) {
            // Return ETH
            (bool success, ) = quiz.creator.call{value: quiz.prizeAmount}("");
            if (!success) revert TransferFailed();
        } else {
            // Return ERC20 tokens
            IERC20 token = IERC20(quiz.prizeToken);
            if (!token.transfer(quiz.creator, quiz.prizeAmount)) {
                revert TransferFailed();
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
