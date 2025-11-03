// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IQuizManager
/// @notice Common interface for all Hoot quiz manager variants
interface IQuizManager {
    // =========================
    // Events (shared signatures)
    // =========================

    /// @notice Emitted when the treasury address is updated
    /// @param newTreasury The newly set treasury address
    event TreasuryUpdated(address indexed newTreasury);

    /// @notice Emitted when the treasury fee percent is updated
    /// @param newFeePercent New fee percentage (relative to feePrecision)
    event TreasuryFeePercentUpdated(uint256 newFeePercent);

    /// @notice Emitted when the fee precision denominator is updated
    /// @param newPrecision New precision denominator value
    event FeePrecisionUpdated(uint256 newPrecision);

    /// @notice Emitted before distributing prizes
    /// @param quizId The quiz identifier
    /// @param winners The array of winner addresses
    /// @param amounts The array of amounts per winner
    /// @param treasuryAmount Amount going to the treasury for this distribution
    event PrizeDistributionStarted(
        string indexed quizId,
        address[] winners,
        uint256[] amounts,
        uint256 treasuryAmount
    );

    /// @notice Emitted with prize calculation details for transparency
    /// @param totalPrize Total prize considered for the distribution
    /// @param treasuryFee Calculated treasury fee for this distribution
    /// @param prizeAmounts The final amounts to winners
    event PrizeCalculations(
        uint256 totalPrize,
        uint256 treasuryFee,
        uint256[] prizeAmounts
    );

    /// @notice Emitted before transferring amount to treasury
    /// @param treasury The treasury address
    /// @param amount The amount being transferred
    event TreasuryTransfer(address treasury, uint256 amount);

    /// @notice Emitted after a successful transfer to treasury
    /// @param treasury The treasury address
    /// @param amount The amount transferred
    event TreasuryTransferSuccess(address treasury, uint256 amount);

    /// @notice Emitted before transferring amount to a winner
    /// @param winner The winner address
    /// @param amount The amount being transferred
    /// @param position Winner position (1-indexed) when applicable
    event WinnerTransfer(address winner, uint256 amount, uint256 position);

    /// @notice Emitted after a successful transfer to a winner
    /// @param winner The winner address
    /// @param amount The amount transferred
    /// @param position Winner position (1-indexed) when applicable
    event WinnerTransferSuccess(address winner, uint256 amount, uint256 position);

    /// @notice Emitted when a quiz is cancelled
    /// @param quizId The quiz identifier
    /// @param creator The quiz creator address
    event QuizCancelled(string indexed quizId, address indexed creator);

    // ==============
    // Shared errors
    // ==============

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

    // ==================
    // Admin / Parameters
    // ==================

    /// @notice Set the treasury address
    /// @param newTreasury New treasury address
    function setTreasury(address newTreasury) external;

    /// @notice Get the treasury address
    /// @return Treasury address
    function getTreasury() external view returns (address);

    /// @notice Set the treasury fee percent (relative to feePrecision)
    /// @param newFeePercent New fee percent
    function setTreasuryFeePercent(uint256 newFeePercent) external;

    /// @notice Get the treasury fee percent
    /// @return Current treasury fee percent
    function getTreasuryFeePercent() external view returns (uint256);

    /// @notice Set the fee precision denominator
    /// @param newPrecision New precision value (> 0)
    function setFeePrecision(uint256 newPrecision) external;

    /// @notice Get the fee precision denominator
    /// @return Current precision denominator
    function getFeePrecision() external view returns (uint256);

    // ============
    // Quiz lifecycle
    // ============

    /// @notice Check if a quiz exists
    /// @param quizId Quiz identifier
    /// @return True if exists
    function quizExists(string calldata quizId) external view returns (bool);

    /// @notice Mark a quiz as active
    /// @param quizId Quiz identifier
    function setQuizActive(string calldata quizId) external;

    /// @notice Cancel a quiz, returning funds according to implementation
    /// @param quizId Quiz identifier
    function cancelQuiz(string calldata quizId) external;
}


