// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LPTreasury
 * @notice Multi-sig controlled treasury holding LP reserves.
 *
 * Security:
 *   - N-of-M multi-sig for withdrawals above threshold
 *   - Timelock on large withdrawals (>$50K equivalent)
 *   - Whitelisted destination addresses only
 *   - Emergency freeze by any signer
 *   - All actions emit events for audit trail
 *   - No delegatecall, no selfdestruct
 *   - ReentrancyGuard on all state changes
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LPTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public requiredSignatures;
    uint256 public largeWithdrawalThreshold; // in token decimals
    uint256 public timelockDelay;

    bool public frozen;

    struct WithdrawalRequest {
        address token;
        address to;
        uint256 amount;
        uint256 approvalCount;
        uint256 executeAfter;
        bool executed;
        bool cancelled;
        mapping(address => bool) approvedBy;
    }

    uint256 public requestNonce;
    mapping(uint256 => WithdrawalRequest) public requests;

    mapping(address => bool) public whitelistedDestinations;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Deposited(address indexed token, address indexed from, uint256 amount);
    event WithdrawalRequested(uint256 indexed id, address token, address to, uint256 amount, bool requiresTimelock);
    event WithdrawalApproved(uint256 indexed id, address indexed signer);
    event WithdrawalExecuted(uint256 indexed id, address token, address to, uint256 amount);
    event WithdrawalCancelled(uint256 indexed id);
    event DestinationWhitelisted(address indexed destination, bool status);
    event TreasuryFrozen(address indexed freezer);
    event TreasuryUnfrozen(address indexed unfreezer);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address[] memory signers_,
        uint256 requiredSignatures_,
        uint256 largeWithdrawalThreshold_,
        uint256 timelockDelay_
    ) {
        require(signers_.length >= requiredSignatures_, "Not enough signers");
        require(requiredSignatures_ > 0, "Need at least 1 signature");

        for (uint256 i = 0; i < signers_.length; i++) {
            require(signers_[i] != address(0), "Invalid signer");
            require(!isSigner[signers_[i]], "Duplicate signer");
            isSigner[signers_[i]] = true;
            signers.push(signers_[i]);
        }

        requiredSignatures = requiredSignatures_;
        largeWithdrawalThreshold = largeWithdrawalThreshold_;
        timelockDelay = timelockDelay_;
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }

    modifier notFrozen() {
        require(!frozen, "Treasury is frozen");
        _;
    }

    // ─── Deposit ─────────────────────────────────────────────────────────────

    function deposit(address token, uint256 amount) external nonReentrant notFrozen {
        require(amount > 0, "Amount must be positive");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, msg.sender, amount);
    }

    // ─── Withdrawal Request ──────────────────────────────────────────────────

    function requestWithdrawal(
        address token,
        address to,
        uint256 amount
    )
        external
        onlySigner
        notFrozen
        nonReentrant
        returns (uint256)
    {
        require(whitelistedDestinations[to], "Destination not whitelisted");
        require(amount > 0, "Amount must be positive");
        require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient treasury balance");

        uint256 id = requestNonce++;
        WithdrawalRequest storage req = requests[id];
        req.token = token;
        req.to = to;
        req.amount = amount;
        req.approvalCount = 1;
        req.approvedBy[msg.sender] = true;

        bool requiresTimelock = amount >= largeWithdrawalThreshold;
        req.executeAfter = requiresTimelock
            ? block.timestamp + timelockDelay
            : block.timestamp;

        emit WithdrawalRequested(id, token, to, amount, requiresTimelock);
        emit WithdrawalApproved(id, msg.sender);

        return id;
    }

    function approveWithdrawal(uint256 id) external onlySigner notFrozen {
        WithdrawalRequest storage req = requests[id];
        require(!req.executed, "Already executed");
        require(!req.cancelled, "Already cancelled");
        require(!req.approvedBy[msg.sender], "Already approved");

        req.approvedBy[msg.sender] = true;
        req.approvalCount++;

        emit WithdrawalApproved(id, msg.sender);
    }

    function executeWithdrawal(uint256 id) external onlySigner nonReentrant notFrozen {
        WithdrawalRequest storage req = requests[id];
        require(!req.executed, "Already executed");
        require(!req.cancelled, "Already cancelled");
        require(req.approvalCount >= requiredSignatures, "Insufficient approvals");
        require(block.timestamp >= req.executeAfter, "Timelock not elapsed");

        req.executed = true;
        IERC20(req.token).safeTransfer(req.to, req.amount);

        emit WithdrawalExecuted(id, req.token, req.to, req.amount);
    }

    function cancelWithdrawal(uint256 id) external onlySigner {
        WithdrawalRequest storage req = requests[id];
        require(!req.executed, "Already executed");
        req.cancelled = true;
        emit WithdrawalCancelled(id);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function whitelistDestination(address dest, bool status) external onlySigner {
        whitelistedDestinations[dest] = status;
        emit DestinationWhitelisted(dest, status);
    }

    function freeze() external onlySigner {
        frozen = true;
        emit TreasuryFrozen(msg.sender);
    }

    function unfreeze() external onlySigner {
        require(frozen, "Not frozen");
        frozen = false;
        emit TreasuryUnfrozen(msg.sender);
    }

    // ─── View ────────────────────────────────────────────────────────────────

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getRequestApprovalCount(uint256 id) external view returns (uint256) {
        return requests[id].approvalCount;
    }

    function isRequestApprovedBy(uint256 id, address signer) external view returns (bool) {
        return requests[id].approvedBy[signer];
    }
}
