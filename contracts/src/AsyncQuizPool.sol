// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AsyncQuizPool
/// @notice Manages multiple async quizzes with per-quiz token, dynamic buy-in, and top-4 payouts
contract AsyncQuizPool is Ownable2Step, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Role allowed to create and finalize quizzes.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @dev Basis points denominator.
    uint16 public constant MAX_BPS = 10_000;
    uint256 private constant PRICE_NUMERATOR = 101;
    uint256 private constant PRICE_DENOMINATOR = 100;

    /// @notice Simple lifecycle status.
    enum QuizStatus {
        Open,
        Finalized,
        Cancelled
    }

    /// @notice Quiz storage layout.
    struct Quiz {
        address creator;
        address buyInToken; // address(0) for native ETH
        uint256 baseBuyIn;
        uint256 currentBuyIn;
        uint64 startTime;
        uint64 endTime;
        uint32 playersCount;
        uint256 prizePool;
        uint16 creatorFeeBps;
        uint16 protocolFeeBps;
        QuizStatus status;
        bool finalized;
    }

    struct PayoutInfo {
        uint256 prizePool;
        uint256 winnersTotal;
        uint256 creatorFee;
        uint256 protocolFee;
        uint256 ratioSum;
    }

    /// @notice Quiz storage mapping.
    mapping(uint256 => Quiz) public quizzes;
    /// @notice Participation tracking: quizId => player => joined.
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    /// @notice Token allowlist (address(0) for native ETH is implicitly allowed).
    mapping(address => bool) public allowedTokens;

    /// @notice Incremental quiz id counter.
    uint256 public quizzesCount;

    /// @notice Protocol treasury recipient for protocol fees.
    address public protocolTreasury;
    /// @notice Global fee params applied to newly created quizzes (snapshotted per quiz).
    uint16 public creatorFeeBps;
    uint16 public protocolFeeBps;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------
    error InvalidTreasury();
    error InvalidFees();
    error TokenNotAllowed();
    error QuizNotFound();
    error QuizClosed();
    error QuizNotStarted();
    error QuizEnded();
    error QuizStillRunning();
    error CreatorCannotJoin();
    error AlreadyJoined();
    error InvalidBuyIn();
    error InvalidTimeRange();
    error InvalidWinner();
    error InvalidWinnersCount();
    error ETHTransferFailed();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event QuizCreated(
        uint256 indexed quizId,
        address indexed creator,
        address indexed buyInToken,
        uint256 baseBuyIn,
        uint64 startTime,
        uint64 endTime,
        uint16 creatorFeeBps,
        uint16 protocolFeeBps
    );

    event PlayerJoined(uint256 indexed quizId, address indexed player, uint256 amount);

    event FeesUpdated(uint16 creatorFeeBps, uint16 protocolFeeBps);
    event ProtocolTreasuryUpdated(address indexed treasury);
    event TokenAllowlistUpdated(address indexed token, bool allowed);

    event QuizFinalized(
        uint256 indexed quizId,
        address[] winners,
        uint256 winnersTotal,
        uint256 creatorFee,
        uint256 protocolFee
    );

    // -------------------------------------------------------------------------
    // Constructor & modifiers
    // -------------------------------------------------------------------------

    constructor(address _protocolTreasury, uint16 _creatorFeeBps, uint16 _protocolFeeBps)
        Ownable(msg.sender)
    {
        if (_protocolTreasury == address(0)) revert InvalidTreasury();
        _setFeesInternal(_creatorFeeBps, _protocolFeeBps);
        protocolTreasury = _protocolTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    modifier quizExists(uint256 quizId) {
        if (quizzes[quizId].creator == address(0)) revert QuizNotFound();
        _;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Update global fee parameters for future quizzes.
    function setFees(uint16 _creatorFeeBps, uint16 _protocolFeeBps) external onlyOwner {
        _setFeesInternal(_creatorFeeBps, _protocolFeeBps);
        emit FeesUpdated(_creatorFeeBps, _protocolFeeBps);
    }

    /// @notice Update protocol treasury recipient.
    function setProtocolTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidTreasury();
        protocolTreasury = _treasury;
        emit ProtocolTreasuryUpdated(_treasury);
    }

    /// @notice Manage ERC20 token allowlist.
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    /// @notice Convenience helper to grant admin role.
    function grantAdminRole(address account) external onlyOwner {
        _grantRole(ADMIN_ROLE, account);
    }

    /// @notice Convenience helper to revoke admin role.
    function revokeAdminRole(address account) external onlyOwner {
        _revokeRole(ADMIN_ROLE, account);
    }

    // -------------------------------------------------------------------------
    // Quiz lifecycle
    // -------------------------------------------------------------------------

    /// @notice Create a new quiz. Callable by anyone.
    /// @param creator Address of quiz creator (cannot join or win).
    /// @param buyInToken Token used for buy-in (address(0) for native).
    /// @param baseBuyIn Starting buy-in amount.
    /// @param startTime Start timestamp for joins.
    /// @param endTime End timestamp for joins.
    /// @return quizId Newly created quiz id.
    function createQuiz(
        address creator,
        address buyInToken,
        uint256 baseBuyIn,
        uint64 startTime,
        uint64 endTime
    ) external returns (uint256 quizId) {
        if (creator == address(0)) revert CreatorCannotJoin();
        if (baseBuyIn == 0) revert InvalidBuyIn();
        if (endTime <= startTime) revert InvalidTimeRange();

        if (buyInToken != address(0) && !allowedTokens[buyInToken]) {
            revert TokenNotAllowed();
        }

        quizId = ++quizzesCount;
        quizzes[quizId] = Quiz({
            creator: creator,
            buyInToken: buyInToken,
            baseBuyIn: baseBuyIn,
            currentBuyIn: baseBuyIn,
            startTime: startTime,
            endTime: endTime,
            playersCount: 0,
            prizePool: 0,
            creatorFeeBps: creatorFeeBps,
            protocolFeeBps: protocolFeeBps,
            status: QuizStatus.Open,
            finalized: false
        });

        emit QuizCreated(
            quizId,
            creator,
            buyInToken,
            baseBuyIn,
            startTime,
            endTime,
            creatorFeeBps,
            protocolFeeBps
        );
    }

    /// @notice Join an open quiz with the appropriate buy-in.
    /// @param quizId Target quiz id.
    function joinQuiz(uint256 quizId) external payable nonReentrant quizExists(quizId) {
        Quiz storage quiz = quizzes[quizId];

        if (quiz.status != QuizStatus.Open || quiz.finalized) revert QuizClosed();
        if (block.timestamp < quiz.startTime) revert QuizNotStarted();
        if (block.timestamp > quiz.endTime) revert QuizEnded();
        if (msg.sender == quiz.creator) revert CreatorCannotJoin();
        if (hasJoined[quizId][msg.sender]) revert AlreadyJoined();

        uint256 buyInAmount = quiz.currentBuyIn;
        if (buyInAmount == 0) revert InvalidBuyIn();

        hasJoined[quizId][msg.sender] = true;

        if (quiz.buyInToken == address(0)) {
            if (msg.value != buyInAmount) revert InvalidBuyIn();
        } else {
            if (msg.value != 0) revert InvalidBuyIn();
            IERC20(quiz.buyInToken).safeTransferFrom(msg.sender, address(this), buyInAmount);
        }

        quiz.playersCount += 1;
        quiz.prizePool += buyInAmount;
        quiz.currentBuyIn = (buyInAmount * PRICE_NUMERATOR) / PRICE_DENOMINATOR;

        emit PlayerJoined(quizId, msg.sender, buyInAmount);
    }

    /// @notice Finalize a quiz and distribute prizes to top winners plus fees.
    /// @param quizId Target quiz id.
    /// @param winners Ordered list of winners (max 4). Ratios 40/30/20/10 renormalized for fewer winners.
    function finalizeQuiz(uint256 quizId, address[] calldata winners)
        external
        nonReentrant
        onlyRole(ADMIN_ROLE)
        quizExists(quizId)
    {
        Quiz storage quiz = quizzes[quizId];

        if (quiz.status != QuizStatus.Open || quiz.finalized) revert QuizClosed();
        if (block.timestamp <= quiz.endTime) revert QuizStillRunning();
        uint256 winnersCount = winners.length;
        if (winnersCount == 0 || winnersCount > 4) revert InvalidWinnersCount();

        PayoutInfo memory info = _buildPayoutInfo(quiz, winnersCount);

        // Snapshot state before external transfers
        quiz.finalized = true;
        quiz.status = QuizStatus.Finalized;
        quiz.prizePool = 0;

        uint256 distributed;
        for (uint256 i; i < winnersCount; i++) {
            address winner = winners[i];
            if (winner == address(0) || winner == quiz.creator) revert InvalidWinner();
            if (!hasJoined[quizId][winner]) revert InvalidWinner();

            uint256 share = (info.winnersTotal * _ratioForIndex(i)) / info.ratioSum;
            if (i == winnersCount - 1) {
                // send any dust to last winner
                share = info.winnersTotal - distributed;
            }
            distributed += share;
            _payout(quiz.buyInToken, winner, share);
        }

        _payout(quiz.buyInToken, quiz.creator, info.creatorFee);
        _payout(quiz.buyInToken, protocolTreasury, info.protocolFee);

        emit QuizFinalized(quizId, winners, info.winnersTotal, info.creatorFee, info.protocolFee);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns current buy-in for a quiz.
    function getCurrentBuyIn(uint256 quizId) external view quizExists(quizId) returns (uint256) {
        return quizzes[quizId].currentBuyIn;
    }

    /// @notice Returns a quiz struct.
    function getQuiz(uint256 quizId) external view quizExists(quizId) returns (Quiz memory) {
        return quizzes[quizId];
    }

    /// @notice Returns whether a token is allowed (native implicitly allowed).
    function isTokenAllowed(address token) external view returns (bool) {
        if (token == address(0)) return true;
        return allowedTokens[token];
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _setFeesInternal(uint16 _creatorFeeBps, uint16 _protocolFeeBps) internal {
        if (_creatorFeeBps + _protocolFeeBps > MAX_BPS) revert InvalidFees();
        creatorFeeBps = _creatorFeeBps;
        protocolFeeBps = _protocolFeeBps;
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _buildPayoutInfo(Quiz storage quiz, uint256 winnersCount)
        internal
        view
        returns (PayoutInfo memory info)
    {
        uint16 totalFeeBps = quiz.creatorFeeBps + quiz.protocolFeeBps;
        if (totalFeeBps > MAX_BPS) revert InvalidFees();

        info.prizePool = quiz.prizePool;
        info.winnersTotal = (info.prizePool * (MAX_BPS - totalFeeBps)) / MAX_BPS;
        info.creatorFee = (info.prizePool * quiz.creatorFeeBps) / MAX_BPS;
        info.protocolFee = (info.prizePool * quiz.protocolFeeBps) / MAX_BPS;

        for (uint256 i; i < winnersCount; i++) {
            info.ratioSum += _ratioForIndex(i);
        }
    }

    function _ratioForIndex(uint256 index) internal pure returns (uint256) {
        if (index == 0) return 40;
        if (index == 1) return 30;
        if (index == 2) return 20;
        return 10; // index 3
    }

    // -------------------------------------------------------------------------
    // Overrides
    // -------------------------------------------------------------------------
    function _transferOwnership(address newOwner) internal override(Ownable2Step) {
        address oldOwner = owner();
        super._transferOwnership(newOwner);
        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        if (oldOwner != address(0)) {
            _revokeRole(DEFAULT_ADMIN_ROLE, oldOwner);
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}

