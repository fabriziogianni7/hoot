// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HootQuizManager
 * @dev Manages quiz prize pools with ETH and ERC20 token support
 */
contract HootQuizManager is Ownable, ReentrancyGuard {
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
        QuizStatus status;
        address[3] winners;
    }

    mapping(string => Quiz) public quizzes;
    mapping(string => address) public quizDistributors;
    address public treasury;
    uint256 public treasuryFeePercent; // Fee in basis points (10000 = 1%, 1000000 = 100%)
    uint256 public feePrecision; // Precision denominator for fee calculation (default: 1000000 = 4 decimals)

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
            token.safeTransferFrom(msg.sender, address(this), prizeAmount);
        }

        quizzes[quizId] = Quiz({
            quizId: quizId,
            creator: msg.sender,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            status: QuizStatus.Pending,
            winners: [address(0), address(0), address(0)]
        });

        // Set the creator as the distributor for this quiz
        quizDistributors[quizId] = msg.sender;

        emit QuizCreated(quizId, msg.sender, prizeToken, prizeAmount);
    }

    /**
     * @dev Distribute prizes to winners (max 5) and treasury gets a fee automatically
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

        // Distribute prizes to winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && amounts[i] > 0) {
                emit WinnerTransfer(winners[i], amounts[i], i + 1);
                
                if (quiz.prizeToken == address(0)) {
                    // ETH transfer
                    (bool success, ) = winners[i].call{value: amounts[i]}("");
                    if (!success) revert TransferFailed();
                } else {
                    // ERC20 transfer
                    IERC20(quiz.prizeToken).safeTransfer(winners[i], amounts[i]);
                }
                
                emit WinnerTransferSuccess(winners[i], amounts[i], i + 1);
            }
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
        
        // Update quiz status
        quiz.status = QuizStatus.Completed;

        emit PrizeDistributed(quizId, winners, amounts, treasuryAmount);
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
            IERC20(quiz.prizeToken).safeTransfer(quiz.creator, quiz.prizeAmount);
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
