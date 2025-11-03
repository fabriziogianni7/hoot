// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IQuizManager} from "../interfaces/IQuizManager.sol";

/// @title QuizManagerBase
/// @notice Abstract base providing shared storage, access control, admin fns and transfer utilities
abstract contract QuizManagerBase is Ownable, ReentrancyGuard, IQuizManager {
    using SafeERC20 for IERC20;

    // Shared storage
    mapping(string => address) public quizDistributors;
    address public treasury;
    uint256 public treasuryFeePercent; // relative to feePrecision
    uint256 public feePrecision; // denominator

    /// @notice Restricts to owner or distributor for a given quiz
    modifier onlyOwnerOrQuizzDistributor(string memory quizId) {
        if (msg.sender != owner() && msg.sender != quizDistributors[quizId]) {
            revert UnauthorizedDistributor();
        }
        _;
    }

    constructor(address _treasury, uint256 _treasuryFeePercent, uint256 _feePrecision) Ownable(msg.sender) {
        if (_feePrecision == 0) revert InvalidFeePrecision();
        if (_treasuryFeePercent > _feePrecision) revert InvalidTreasuryFeePercent();
        treasury = _treasury;
        treasuryFeePercent = _treasuryFeePercent;
        feePrecision = _feePrecision;
    }

    // ============ Admin ============

    /// @inheritdoc IQuizManager
    function setTreasury(address newTreasury) external override onlyOwner {
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @inheritdoc IQuizManager
    function getTreasury() external view override returns (address) {
        return treasury;
    }

    /// @inheritdoc IQuizManager
    function setTreasuryFeePercent(uint256 newFeePercent) external override onlyOwner {
        if (newFeePercent > feePrecision) revert InvalidTreasuryFeePercent();
        treasuryFeePercent = newFeePercent;
        emit TreasuryFeePercentUpdated(newFeePercent);
    }

    /// @inheritdoc IQuizManager
    function getTreasuryFeePercent() external view override returns (uint256) {
        return treasuryFeePercent;
    }

    /// @inheritdoc IQuizManager
    function setFeePrecision(uint256 newPrecision) external override onlyOwner {
        if (newPrecision == 0) revert InvalidFeePrecision();
        if (treasuryFeePercent > newPrecision) revert InvalidTreasuryFeePercent();
        feePrecision = newPrecision;
        emit FeePrecisionUpdated(newPrecision);
    }

    /// @inheritdoc IQuizManager
    function getFeePrecision() external view override returns (uint256) {
        return feePrecision;
    }

    // ============ Internal helpers ============

    /// @notice Collect ETH or ERC20 funds from caller based on prizeToken
    /// @dev For prizeToken == address(0), expects msg.value == amount
    function _collectFunds(address prizeToken, uint256 amount) internal {
        if (amount == 0) revert InvalidPrizeAmount();
        if (prizeToken == address(0)) {
            if (msg.value != amount) revert InvalidPrizeAmount();
        } else {
            if (msg.value > 0) revert InvalidPrizeAmount();
            IERC20 token = IERC20(prizeToken);
            if (token.balanceOf(msg.sender) < amount) revert InsufficientBalance();
            if (token.allowance(msg.sender, address(this)) < amount) revert InsufficientBalance();
            token.safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    /// @notice Safe transfer ETH or ERC20
    function _safeTransfer(address prizeToken, address to, uint256 amount) internal {
        if (amount == 0 || to == address(0)) return;
        if (prizeToken == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(prizeToken).safeTransfer(to, amount);
        }
    }

    /// @notice Transfer to treasury emitting standardized events
    function _transferToTreasury(address prizeToken, uint256 amount) internal {
        if (amount == 0 || treasury == address(0)) return;
        emit TreasuryTransfer(treasury, amount);
        _safeTransfer(prizeToken, treasury, amount);
        emit TreasuryTransferSuccess(treasury, amount);
    }

    // ============ Abstracts to implement ============
    function quizExists(string calldata quizId) external view virtual override returns (bool);
    function setQuizActive(string calldata quizId) external virtual override;
    function cancelQuiz(string calldata quizId) external virtual override;
}


