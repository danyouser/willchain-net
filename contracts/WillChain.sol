// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title WillChain (WILL)
 * @author WillChain Team
 * @custom:security-contact security@willchain.net
 * @notice Dead Man's Switch token. Stay active or your tokens get recycled.
 *
 * HOW IT WORKS:
 * 1. Hold WILL tokens — your vault is active
 * 2. Any on-chain activity (transfers, swaps) auto-confirms you're alive
 * 3. Go inactive past your chosen period → grace period starts
 * 4. Set a successor → they can claim your vault after inactivity + grace
 * 5. No action → anyone triggers recycling: 47% burn + 47% dividends + 5% treasury + 1% caller
 *
 * INACTIVITY PERIODS (user-configurable):
 * - 30 days  → total timeout 90 days
 * - 90 days  → total timeout 150 days (default)
 * - 180 days → total timeout 240 days
 * - 365 days → total timeout 425 days
 *
 * PROOF OF ACTIVITY:
 * Any token transfer from your wallet resets your timer automatically.
 * No manual check-in needed if you're actively using your wallet.
 */
contract WillChain is ERC20, ERC20Burnable, ReentrancyGuard, Ownable2Step {

    // ============ Custom Errors ============

    error NotDesignatedSuccessor();
    error InvalidSuccessorAddress();
    error CannotDesignateSelf();
    error CannotDesignateContract();
    error CircularSuccessorChain();
    error InvalidInactivityPeriod();
    error DataHashCannotBeZero();
    error NodeStillActive();
    error NodeAlreadyAbandoned();
    error ClaimAlreadyInitiated();
    error NoActiveClaimToCancel();
    error ClaimNotInitiated();
    error VetoPeriodNotEnded();
    error ClaimExpired();
    error NoTokensToTransfer();
    error FlashloanPrevention();
    error EmptyCommitHash();
    error NoActiveCommit();
    error RevealTooEarly();
    error CommitExpired();
    error InvalidCommitReveal();
    error UseFreshCommitReveal();
    error CannotRecycleContract();
    error CannotRecycleZeroAddress();
    error NodeNotAbandoned();
    error NoTokensToRecycle();
    error NotRegistered();
    error NoDividendsToClaim();
    error TreasuryCannotBeZero();
    error TreasuryCannotBeContract();
    error NoPendingTreasuryChange();
    error TimelockActive();
    error NoDustAvailable();
    error OwnershipRenouncementDisabled();
    error DelegatedSpendingBlocked();

    // ============ Constants ============

    uint256 public constant PERIOD_30_DAYS  = 30 days;
    uint256 public constant PERIOD_90_DAYS  = 90 days;
    uint256 public constant PERIOD_180_DAYS = 180 days;
    uint256 public constant PERIOD_365_DAYS = 365 days;
    uint256 public constant DEFAULT_INACTIVITY_PERIOD = PERIOD_90_DAYS;

    uint256 public constant GRACE_PERIOD = 30 days;
    uint256 public constant CLAIM_PERIOD = 30 days;

    // Distribution on recycling (basis points, 10000 = 100%)
    uint256 public constant MAINTAINER_REWARD_BPS = 100;   // 1%  — reward for triggering recycle
    uint256 public constant PROTOCOL_FEE_BPS      = 500;   // 5%  — treasury
    uint256 public constant BURN_BPS              = 4700;  // 47% — burned forever
    uint256 public constant RECYCLE_BPS           = 4700;  // 47% — dividend pool
    // Total: 100 + 500 + 4700 + 4700 = 10000 ✓

    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion

    // Service tier thresholds
    uint256 public constant BASIC_VAULT_THRESHOLD  =   1_000 * 10**18;
    uint256 public constant FAMILY_VAULT_THRESHOLD =  10_000 * 10**18;
    uint256 public constant LEGACY_VAULT_THRESHOLD = 100_000 * 10**18;

    // ============ Node State ============

    enum VaultStatus { UNREGISTERED, ACTIVE, GRACE, CLAIMABLE, ABANDONED }

    struct NodeState {
        /// @dev Unix timestamp of last confirmed activity. 0 = UNREGISTERED (never called confirmActivity).
        uint256 lastActivityTimestamp;
        /// @dev Timestamp when initiateSuccessorClaim() was called. Used to compute CLAIMABLE deadline.
        uint256 claimInitiationTimestamp;
        /// @dev User-chosen inactivity period in seconds. 0 = use DEFAULT_INACTIVITY_PERIOD (90 days).
        uint256 inactivityPeriod;
        /// @dev Optional encrypted vault data reference (e.g. IPFS CID). Not validated on-chain.
        bytes32 vaultDataHash;
        /// @dev Address designated to inherit tokens after a successful claim. address(0) = none set.
        address designatedSuccessor;
        /// @dev True once successor calls initiateSuccessorClaim(). Starts the 30-day veto window.
        bool    successorClaimInitiated;
    }

    mapping(address => NodeState) public nodeStates;

    // ============ Dividend Pool (Pull Pattern) ============

    uint256 public dividendPool;
    uint256 public dividendPerToken;
    uint256 private constant DIVIDEND_SCALE = 1e18;

    mapping(address => uint256) public lastDividendPerToken;
    mapping(address => uint256) public unclaimedDividends;

    // ============ Flashloan Protection ============

    /// @dev Per-user last transfer block. Prevents flashloan: borrow→recycle/claim→repay in one block.
    mapping(address => uint256) public lastTransferBlock;

    // ============ Protocol ============

    address public protocolTreasury;
    uint256 public totalProtocolFees;
    uint256 public totalRemovedFromCirculation;
    uint256 public totalRecycledToNetwork;
    uint256 public totalSuccessfulTransfers;

    // ============ Treasury Timelock ============

    /// @dev Proposed new treasury address, pending timelock expiry.
    address public pendingTreasury;
    /// @dev Timestamp after which executeTreasuryChange() can be called.
    uint256 public pendingTreasuryEffectiveAt;
    /// @dev Minimum delay between proposing and executing a treasury change.
    uint256 public constant TREASURY_CHANGE_DELAY = 2 days;

    /// @dev Sum of balances of UNREGISTERED addresses (lastActivityTimestamp == 0).
    /// Subtracted from eligibleSupply so unregistered holders do NOT earn dividends.
    uint256 public totalUnregisteredSupply;

    /// @dev Permanently true once an address calls confirmActivity() (or any function that
    /// calls _performActivityConfirmation). Prevents recycled/deleted nodes from being
    /// misidentified as "never registered" after their nodeState is deleted.
    mapping(address => bool) public everRegistered;

    // ============ Commit-Reveal MEV Protection ============

    /// @dev Minimum block delay between commit and reveal (2 blocks ≈ 4s on Base).
    uint256 public constant COMMIT_MIN_DELAY = 2;
    /// @dev Maximum block delay before a commit expires (256 blocks ≈ 8.5 min on Base).
    uint256 public constant COMMIT_MAX_DELAY = 256;
    /// @dev Fresh ABANDONED window: commit-reveal required for first 24 hours after ABANDONED.
    uint256 public constant COMMIT_REVEAL_WINDOW = 1 days;

    struct RecycleCommit {
        bytes32 commitHash;
        uint64  commitBlock;
    }

    /// @dev One pending commit per address. Overwritten on re-commit.
    mapping(address => RecycleCommit) public recycleCommits;

    // ============ Events ============

    /// @dev Emitted by every internal activity confirmation (auto-confirm via transfer OR explicit call).
    ///      Useful for indexers tracking all timer resets. Bots should use UserActivityConfirmed instead.
    event ActivityConfirmed(address indexed node, uint256 timestamp);
    /// @dev Emitted ONLY when user explicitly calls confirmActivity(). Suppresses auto-transfer noise.
    ///      This is the bot-friendly signal: one event per intentional check-in, not per transfer.
    event UserActivityConfirmed(address indexed node, uint256 timestamp);
    event SuccessorDesignated(address indexed node, address indexed successor);
    event SuccessorClaimInitiated(address indexed node, address indexed successor, uint256 timestamp);
    event SuccessorClaimCancelled(address indexed node);
    event VaultAccessTransferred(address indexed fromNode, address indexed toNode, uint256 amount);
    event InactiveNodeRecycled(
        address indexed node,
        uint256 removedFromCirculation,
        uint256 recycledToNetwork,
        address indexed maintainer,
        uint256 maintainerReward
    );
    event VaultDataUpdated(address indexed node, bytes32 dataHash);
    event InactivityPeriodChanged(address indexed node, uint256 newPeriod);
    event DividendsClaimed(address indexed node, uint256 amount);
    event DividendsDistributed(uint256 amount, uint256 newDividendPerToken);
    event ProtocolFeeCollected(address indexed from, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    /// @dev Emitted when a treasury change is proposed (subject to 2-day timelock).
    event TreasuryChangeProposed(address indexed proposed, uint256 effectiveAt);
    /// @dev Emitted when a pending treasury change is cancelled before execution.
    event TreasuryChangeCancelled(address indexed cancelled);
    /// @dev Emitted when a node calls confirmActivity() for the first time (UNREGISTERED → ACTIVE).
    event NodeRegistered(address indexed node, uint256 timestamp);
    /// @dev Emitted when dividend dust is recovered by owner via recoverDividendDust().
    event DividendDustRecovered(address indexed to, uint256 amount);
    /// @dev Emitted when dividends are burned because eligibleSupply == 0 (no registered holders).
    event DividendsBurnedNoEligibleHolders(address indexed from, uint256 amount);
    /// @dev Emitted when frozen unclaimed dividends of an abandoned node are recovered during recycling.
    event FrozenDividendsRecovered(address indexed abandonedNode, uint256 amount);
    /// @dev Emitted when a recycler commits a hash for commit-reveal recycling.
    event RecycleCommitted(address indexed committer, bytes32 commitHash, uint256 commitBlock);

    // ============ Modifiers ============

    modifier onlyDesignatedSuccessor(address _node) {
        if (nodeStates[_node].designatedSuccessor != msg.sender) revert NotDesignatedSuccessor();
        _;
    }

    // ============ Constructor ============

    constructor() ERC20("WillChain", "WILL") Ownable(msg.sender) {
        protocolTreasury = msg.sender;
        // Register deployer BEFORE minting so the mint doesn't count towards totalUnregisteredSupply.
        everRegistered[msg.sender] = true;
        nodeStates[msg.sender].lastActivityTimestamp = block.timestamp;
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    // ============ Core Functions ============

    /**
     * @notice Manually confirm you're alive. Resets inactivity timer.
     * @dev Not needed if you're actively sending transactions — those auto-confirm.
     *      ABANDONED is NOT a terminal state — if the owner returns and calls this
     *      (or makes any transfer) before someone calls recycleInactiveNode(), the
     *      vault is restored to ACTIVE. This is intentional: "dead man's switch"
     *      means "presumed dead until proven otherwise", not "permanently dead".
     *      Once recycleInactiveNode() is called the tokens are gone and cannot
     *      be restored.
     */
    function confirmActivity() external {
        _performActivityConfirmation(msg.sender);
        emit UserActivityConfirmed(msg.sender, block.timestamp);
    }

    /**
     * @notice Set your preferred inactivity period.
     * @dev Can be called by UNREGISTERED nodes — acts as a setup action that
     *      also registers the node (calls _performActivityConfirmation).
     * @param _period One of: 30, 90, 180, or 365 days (in seconds)
     */
    function setInactivityPeriod(uint256 _period) external {
        if (
            _period != PERIOD_30_DAYS  &&
            _period != PERIOD_90_DAYS  &&
            _period != PERIOD_180_DAYS &&
            _period != PERIOD_365_DAYS
        ) revert InvalidInactivityPeriod();
        // Reset activity timer: calling this is proof the owner is alive.
        // Without this, switching to a shorter period could instantly make the
        // node ABANDONED if elapsed time already exceeds the new period.
        nodeStates[msg.sender].inactivityPeriod = _period;
        _performActivityConfirmation(msg.sender);
        emit InactivityPeriodChanged(msg.sender, _period);
    }

    /**
     * @notice Designate who receives your vault if you go inactive.
     * @dev Can be called by UNREGISTERED nodes — acts as a setup action that
     *      also registers the node (calls _performActivityConfirmation).
     * @param _successor Address of your chosen successor
     */
    function designateSuccessor(address _successor) external {
        if (_successor == address(0)) revert InvalidSuccessorAddress();
        if (_successor == msg.sender) revert CannotDesignateSelf();
        if (_successor == address(this)) revert CannotDesignateContract();
        // Prevent circular successor chains (A→B where B already has A as successor)
        if (nodeStates[_successor].designatedSuccessor == msg.sender) revert CircularSuccessorChain();
        // Reset activity timer: designating a successor proves the owner is alive.
        nodeStates[msg.sender].designatedSuccessor = _successor;
        _performActivityConfirmation(msg.sender);
        emit SuccessorDesignated(msg.sender, _successor);
    }

    /**
     * @notice Store encrypted vault metadata hash on-chain.
     * @dev Can be called by UNREGISTERED nodes — acts as a setup action that
     *      also registers the node (calls _performActivityConfirmation).
     * @param _dataHash IPFS hash or encrypted data reference
     */
    function updateVaultData(bytes32 _dataHash) external {
        if (_dataHash == bytes32(0)) revert DataHashCannotBeZero();
        // Reset activity timer: updating vault data proves the owner is alive.
        nodeStates[msg.sender].vaultDataHash = _dataHash;
        _performActivityConfirmation(msg.sender);
        emit VaultDataUpdated(msg.sender, _dataHash);
    }

    /**
     * @notice Successor initiates claim after node's inactivity period expires.
     * @dev Starts the 30-day veto window. Owner can cancel anytime during this window.
     * @param _node The inactive node's address
     */
    function initiateSuccessorClaim(address _node) external onlyDesignatedSuccessor(_node) nonReentrant {
        NodeState storage state = nodeStates[_node];
        uint256 inactivityPeriod = _getInactivityPeriod(_node);

        if (block.timestamp <= state.lastActivityTimestamp + inactivityPeriod) revert NodeStillActive();
        // Prevent initiating claim on an already-abandoned vault: doing so would set
        // claimInitiationTimestamp to now, shifting the CLAIMABLE window forward and
        // effectively blocking recyclers by resetting the ABANDONED state.
        if (block.timestamp > state.lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD) revert NodeAlreadyAbandoned();
        if (state.successorClaimInitiated) revert ClaimAlreadyInitiated();

        state.successorClaimInitiated = true;
        state.claimInitiationTimestamp = block.timestamp;

        emit SuccessorClaimInitiated(_node, msg.sender, block.timestamp);
    }

    /**
     * @notice Owner cancels a pending successor claim (veto).
     * @dev Calling this proves you're alive and resets your timer.
     */
    function cancelSuccessorClaim() external {
        if (!nodeStates[msg.sender].successorClaimInitiated) revert NoActiveClaimToCancel();

        _performActivityConfirmation(msg.sender);

        emit SuccessorClaimCancelled(msg.sender);
    }

    /**
     * @notice Complete vault transfer to successor after veto period ends.
     * @dev Only callable while node is still in CLAIMABLE state (not yet ABANDONED).
     * @param _node The inactive node's address
     */
    function completeVaultTransfer(address _node) external onlyDesignatedSuccessor(_node) nonReentrant {
        if (lastTransferBlock[msg.sender] >= block.number) revert FlashloanPrevention();
        NodeState storage state = nodeStates[_node];

        if (!state.successorClaimInitiated) revert ClaimNotInitiated();
        if (block.timestamp <= state.claimInitiationTimestamp + GRACE_PERIOD) revert VetoPeriodNotEnded();

        // Must still be within claim window — not yet abandoned
        // If claim was initiated, the deadline shifts to claim initiation + veto period + claim period
        uint256 claimDeadline = state.claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD;
        if (block.timestamp > claimDeadline) revert ClaimExpired();

        uint256 amount = balanceOf(_node);
        if (amount == 0) revert NoTokensToTransfer();

        // Initialize successor's registration if first time receiving tokens.
        // Must set everRegistered BEFORE _updateDividends so the successor
        // is treated as registered and correctly accumulates dividends.
        if (!everRegistered[msg.sender]) {
            everRegistered[msg.sender] = true;
            uint256 successorBal = balanceOf(msg.sender);
            if (successorBal > 0) totalUnregisteredSupply -= successorBal;
            lastDividendPerToken[msg.sender] = dividendPerToken;
        }
        if (nodeStates[msg.sender].lastActivityTimestamp == 0) {
            nodeStates[msg.sender].lastActivityTimestamp = block.timestamp;
        }

        // Transfer vault to successor
        _updateDividends(_node);
        _updateDividends(msg.sender);

        uint256 nodeDividends = unclaimedDividends[_node];
        if (nodeDividends > 0) {
            unclaimedDividends[_node] = 0;
            unclaimedDividends[msg.sender] += nodeDividends;
        }

        _transfer(_node, msg.sender, amount);

        // Clear original node state
        delete nodeStates[_node];
        everRegistered[_node] = false;

        totalSuccessfulTransfers++;

        emit VaultAccessTransferred(_node, msg.sender, amount);
    }

    // ============ Commit-Reveal Recycling (MEV Protection) ============

    /**
     * @notice Step 1: Commit a hash to recycle a freshly ABANDONED node.
     * @dev Required for nodes ABANDONED less than COMMIT_REVEAL_WINDOW (24h).
     *      hash = keccak256(abi.encodePacked(abandonedNode, salt, msg.sender))
     * @param _commitHash The commit hash hiding the target node and salt
     */
    function commitRecycle(bytes32 _commitHash) external {
        if (_commitHash == bytes32(0)) revert EmptyCommitHash();
        recycleCommits[msg.sender] = RecycleCommit({
            commitHash: _commitHash,
            commitBlock: uint64(block.number)
        });
        emit RecycleCommitted(msg.sender, _commitHash, block.number);
    }

    /**
     * @notice Step 2: Reveal and execute recycling of a freshly ABANDONED node.
     * @dev Must be called 2-256 blocks after commitRecycle(). Verifies hash matches.
     * @param _abandonedNode The target ABANDONED node
     * @param _salt The random salt used in the commit hash
     */
    function executeRecycle(address _abandonedNode, bytes32 _salt) external nonReentrant {
        RecycleCommit storage commit = recycleCommits[msg.sender];
        if (commit.commitBlock == 0) revert NoActiveCommit();

        uint256 blocksPassed = block.number - commit.commitBlock;
        if (blocksPassed < COMMIT_MIN_DELAY) revert RevealTooEarly();
        if (blocksPassed > COMMIT_MAX_DELAY) revert CommitExpired();

        bytes32 expectedHash = keccak256(abi.encodePacked(_abandonedNode, _salt, msg.sender));
        if (commit.commitHash != expectedHash) revert InvalidCommitReveal();

        // Clear commit before external calls (CEI pattern)
        delete recycleCommits[msg.sender];

        _recycleInactiveNode(_abandonedNode);
    }

    /**
     * @notice Direct recycle for nodes ABANDONED longer than COMMIT_REVEAL_WINDOW.
     * @dev After the fresh window (24h), anyone can recycle without commit-reveal.
     * @param _abandonedNode The node that exceeded their total timeout + freshness window
     */
    function recycleInactiveNode(address _abandonedNode) external nonReentrant {
        if (_isFreshAbandoned(_abandonedNode)) revert UseFreshCommitReveal();
        _recycleInactiveNode(_abandonedNode);
    }

    /**
     * @dev Internal recycling logic. Called by both executeRecycle() and recycleInactiveNode().
     */
    function _recycleInactiveNode(address _abandonedNode) internal {
        if (_abandonedNode == address(this)) revert CannotRecycleContract();
        if (_abandonedNode == address(0)) revert CannotRecycleZeroAddress();
        if (lastTransferBlock[_abandonedNode] >= block.number) revert FlashloanPrevention();

        if (getVaultStatus(_abandonedNode) != VaultStatus.ABANDONED) revert NodeNotAbandoned();

        uint256 nodeBalance = balanceOf(_abandonedNode);
        if (nodeBalance == 0) revert NoTokensToRecycle();

        // Update dividend checkpoint before balance changes
        _updateDividends(_abandonedNode);

        // Recover any frozen dividends earned by the abandoned node.
        // Clear node state FIRST to prevent _update hook from resetting it during transfers.
        uint256 nodeDividends = unclaimedDividends[_abandonedNode];
        if (nodeDividends > 0) {
            unclaimedDividends[_abandonedNode] = 0;
            dividendPool -= nodeDividends;
            emit FrozenDividendsRecovered(_abandonedNode, nodeDividends);
        }
        // Delete state before transfers so _update hook won't re-initialize it
        delete nodeStates[_abandonedNode];

        // Move frozen dividends from contract to abandonedNode so all transfers come from one source
        if (nodeDividends > 0) {
            _transfer(address(this), _abandonedNode, nodeDividends);
        }

        // Total to distribute = node's original balance + recovered dividends
        uint256 totalAmount = balanceOf(_abandonedNode);

        // Calculate distributions
        uint256 maintainerReward = (totalAmount * MAINTAINER_REWARD_BPS) / 10000;
        uint256 protocolFee      = (totalAmount * PROTOCOL_FEE_BPS)      / 10000;
        uint256 toBurn           = (totalAmount * BURN_BPS)              / 10000;
        uint256 toRecycle        = totalAmount - maintainerReward - protocolFee - toBurn;

        // 1. Reward caller (1%)
        _transfer(_abandonedNode, msg.sender, maintainerReward);

        // 2. Protocol fee to treasury (5%)
        if (protocolTreasury != address(0)) {
            _transfer(_abandonedNode, protocolTreasury, protocolFee);
            totalProtocolFees += protocolFee;
            emit ProtocolFeeCollected(_abandonedNode, protocolFee);
        } else {
            // Fallback: burn if no treasury set (add to burn, not double-count)
            toBurn += protocolFee;
        }

        // 3. Burn (47%)
        _burn(_abandonedNode, toBurn);

        // 4. Add to dividend pool (47%)
        _addToDividendPool(_abandonedNode, toRecycle);

        // Update stats
        totalRemovedFromCirculation += toBurn;
        totalRecycledToNetwork      += toRecycle;

        // Final cleanup: _transfer(contract, abandonedNode) may re-initialize the timestamp
        // via _update hook. Ensure state is fully cleared after all transfers complete.
        delete nodeStates[_abandonedNode];
        // Mark node as unregistered. If they still hold tokens (e.g. they are also the protocol
        // treasury and received a fee during recycling), count that balance in totalUnregisteredSupply
        // so future confirmActivity() can subtract it without underflow.
        uint256 remainingBal = balanceOf(_abandonedNode);
        everRegistered[_abandonedNode] = false;
        if (remainingBal > 0) totalUnregisteredSupply += remainingBal;

        emit InactiveNodeRecycled(
            _abandonedNode,
            toBurn,
            toRecycle,
            msg.sender,
            maintainerReward
        );
    }

    /**
     * @dev Returns true if node is ABANDONED but within the fresh window (< COMMIT_REVEAL_WINDOW).
     *      Fresh nodes require commit-reveal to prevent MEV front-running.
     */
    function _isFreshAbandoned(address _node) internal view returns (bool) {
        NodeState storage state = nodeStates[_node];
        if (state.lastActivityTimestamp == 0) return false;

        if (getVaultStatus(_node) != VaultStatus.ABANDONED) return false;

        uint256 abandonedAt;
        if (state.successorClaimInitiated) {
            abandonedAt = state.claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD;
        } else {
            abandonedAt = state.lastActivityTimestamp + _getInactivityPeriod(_node) + GRACE_PERIOD + CLAIM_PERIOD;
        }
        return block.timestamp <= abandonedAt + COMMIT_REVEAL_WINDOW;
    }

    // ============ Dividend Functions ============

    /**
     * @notice Claim your share of recycled tokens.
     * @dev Pull pattern — you choose when to claim and pay gas.
     */
    function claimDividends() external nonReentrant {
        if (_isUnregistered(msg.sender)) revert NotRegistered();
        if (lastTransferBlock[msg.sender] >= block.number) revert FlashloanPrevention();
        _updateDividends(msg.sender);

        uint256 amount = unclaimedDividends[msg.sender];
        if (amount == 0) revert NoDividendsToClaim();

        unclaimedDividends[msg.sender] = 0;
        dividendPool -= amount;

        _transfer(address(this), msg.sender, amount);

        emit DividendsClaimed(msg.sender, amount);
    }

    /**
     * @notice Check how much you can claim right now.
     * @dev Returns 0 for UNREGISTERED addresses — they never earn dividends.
     * @param _node The address to check
     * @return Unclaimed dividends in wei (token's smallest unit)
     */
    function pendingDividends(address _node) external view returns (uint256) {
        // Unregistered users earn no dividends
        if (_isUnregistered(_node)) return 0;
        uint256 balance = balanceOf(_node);
        if (balance == 0) return unclaimedDividends[_node];
        uint256 newDividends = (balance * (dividendPerToken - lastDividendPerToken[_node])) / DIVIDEND_SCALE;
        return unclaimedDividends[_node] + newDividends;
    }

    // ============ View Functions ============

    /**
     * @notice Returns the current vault status for a node.
     * @dev Two computation paths exist depending on whether a successor claim has been initiated:
     *
     *   WITHOUT claim (natural timeline):
     *     ACTIVE → lastActivity + inactivityPeriod
     *     GRACE  → + GRACE_PERIOD (30 days)
     *     CLAIMABLE → + CLAIM_PERIOD (30 days)
     *     ABANDONED → after that
     *
     *   WITH claim (successor-initiated timeline):
     *     The timeline resets from claimInitiationTimestamp, which can shift the
     *     ABANDONED deadline forward if the claim was initiated during GRACE.
     *     This is intentional — the successor's action extends the veto window.
     *     GRACE → claimInitiationTimestamp + GRACE_PERIOD
     *     CLAIMABLE → + CLAIM_PERIOD
     *     ABANDONED → after that
     *
     * @param _node The address to check
     * @return The current VaultStatus enum value
     */
    function getVaultStatus(address _node) public view returns (VaultStatus) {
        NodeState storage state = nodeStates[_node];
        if (state.lastActivityTimestamp == 0) return VaultStatus.UNREGISTERED;

        uint256 period = _getInactivityPeriod(_node);

        // Path 1: Successor claim initiated — timeline anchored to claimInitiationTimestamp
        if (state.successorClaimInitiated) {
            uint256 sClaimableAt = state.claimInitiationTimestamp + GRACE_PERIOD;
            uint256 sAbandonedAt = sClaimableAt + CLAIM_PERIOD;
            if (block.timestamp <= sClaimableAt) return VaultStatus.GRACE;
            if (block.timestamp <= sAbandonedAt) return VaultStatus.CLAIMABLE;
            return VaultStatus.ABANDONED;
        }

        // Path 2: Natural inactivity timeline — anchored to lastActivityTimestamp
        uint256 inactiveAt  = state.lastActivityTimestamp + period;
        uint256 claimableAt = inactiveAt + GRACE_PERIOD;
        uint256 abandonedAt = claimableAt + CLAIM_PERIOD;

        if (block.timestamp <= inactiveAt)  return VaultStatus.ACTIVE;
        if (block.timestamp <= claimableAt) return VaultStatus.GRACE;
        if (block.timestamp <= abandonedAt) return VaultStatus.CLAIMABLE;
        return VaultStatus.ABANDONED;
    }

    /// @notice Total time from last activity to ABANDONED status.
    /// @param _node The address to check
    /// @return Total seconds: inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD
    function getTotalTimeout(address _node) public view returns (uint256) {
        return _getInactivityPeriod(_node) + GRACE_PERIOD + CLAIM_PERIOD;
    }

    /// @notice Returns the effective inactivity period for a node.
    /// @param _node The address to check
    /// @return Seconds — user-configured or DEFAULT_INACTIVITY_PERIOD (90 days)
    function getInactivityPeriod(address _node) external view returns (uint256) {
        return _getInactivityPeriod(_node);
    }

    function getNodeState(address node) external view returns (
        uint256 lastActivityTimestamp,
        address designatedSuccessor,
        bool    successorClaimInitiated,
        uint256 claimInitiationTimestamp,
        uint256 timeUntilInactive,
        uint256 timeUntilAbandoned,
        bool    isActive,
        string  memory serviceTier,
        uint256 inactivityPeriod
    ) {
        NodeState storage state = nodeStates[node];
        lastActivityTimestamp    = state.lastActivityTimestamp;
        designatedSuccessor      = state.designatedSuccessor;
        successorClaimInitiated  = state.successorClaimInitiated;
        claimInitiationTimestamp = state.claimInitiationTimestamp;
        inactivityPeriod         = _getInactivityPeriod(node);

        VaultStatus status = getVaultStatus(node);
        // isActive: true only for ACTIVE and GRACE — UNREGISTERED is NOT considered active.
        // Callers should use getVaultStatus() for full status; this bool is kept for ABI compatibility.
        isActive = (status == VaultStatus.ACTIVE || status == VaultStatus.GRACE);

        if (status == VaultStatus.UNREGISTERED) {
            timeUntilInactive = 0;
            timeUntilAbandoned = 0;
        } else {
            uint256 inactiveDeadline  = state.lastActivityTimestamp + inactivityPeriod;
            
            uint256 abandonedDeadline;
            if (state.successorClaimInitiated) {
                 abandonedDeadline = state.claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD;
            } else {
                 abandonedDeadline = state.lastActivityTimestamp + getTotalTimeout(node);
            }

            timeUntilInactive  = block.timestamp < inactiveDeadline  ? inactiveDeadline  - block.timestamp : 0;
            timeUntilAbandoned = block.timestamp < abandonedDeadline ? abandonedDeadline - block.timestamp : 0;
        }

        uint256 balance = balanceOf(node);
        if (balance >= LEGACY_VAULT_THRESHOLD)      serviceTier = "Legacy Vault";
        else if (balance >= FAMILY_VAULT_THRESHOLD) serviceTier = "Family Vault";
        else if (balance >= BASIC_VAULT_THRESHOLD)  serviceTier = "Basic Vault";
        else                                        serviceTier = "No Vault Access";
    }

    /**
     * @notice Returns aggregate protocol statistics.
     * @return totalSupply_ Current total token supply
     * @return recycledToNetwork Cumulative tokens sent to dividend pool
     * @return removedFromCirculation Cumulative tokens burned
     * @return successfulTransfers Number of completed vault transfers
     * @return totalProtocolFees_ Cumulative tokens sent to treasury
     * @return dividendPool_ Current undistributed dividend balance
     */
    function getNetworkStatistics() external view returns (
        uint256 totalSupply_,
        uint256 recycledToNetwork,
        uint256 removedFromCirculation,
        uint256 successfulTransfers,
        uint256 totalProtocolFees_,
        uint256 dividendPool_
    ) {
        totalSupply_           = totalSupply();
        recycledToNetwork      = totalRecycledToNetwork;
        removedFromCirculation = totalRemovedFromCirculation;
        successfulTransfers    = totalSuccessfulTransfers;
        totalProtocolFees_     = totalProtocolFees;
        dividendPool_          = dividendPool;
    }

    /**
     * @notice Returns current protocol fee configuration and lifetime collected fees.
     * @return treasury   Address that receives protocol fees (5% of recycled balances).
     * @return feeBps     Fee in basis points (500 = 5%). Immutable constant.
     * @return totalCollected Cumulative tokens sent to treasury since deployment.
     */
    function getProtocolFeeInfo() external view returns (
        address treasury,
        uint256 feeBps,
        uint256 totalCollected
    ) {
        return (protocolTreasury, PROTOCOL_FEE_BPS, totalProtocolFees);
    }

    // ============ Internal Functions ============

    function _getInactivityPeriod(address _node) internal view returns (uint256) {
        uint256 period = nodeStates[_node].inactivityPeriod;
        return period == 0 ? DEFAULT_INACTIVITY_PERIOD : period;
    }

    /// @dev Returns true if addr has NEVER been registered (never called confirmActivity).
    /// Uses everRegistered to distinguish "deleted after recycling" from "never registered".
    function _isUnregistered(address addr) private view returns (bool) {
        return addr != address(0)
            && addr != address(this)
            && !everRegistered[addr];
    }

    /**
     * @dev Core activity confirmation logic shared by all "I'm alive" operations.
     *
     * If node is UNREGISTERED (everRegistered == false):
     *   - Removes their balance from totalUnregisteredSupply (node now earns dividends)
     *   - Sets everRegistered[node] = true permanently (survives future recycling/re-registration)
     *   - Snapshots lastDividendPerToken to current value (no retroactive earnings)
     *
     * Always resets: lastActivityTimestamp to block.timestamp, clears successorClaimInitiated
     * and claimInitiationTimestamp so any pending claim is cancelled.
     *
     * Callers: confirmActivity(), setInactivityPeriod(), designateSuccessor(),
     *          updateVaultData(), cancelSuccessorClaim(), _update() hook (registered senders only).
     */
    function _performActivityConfirmation(address node) internal {
        // If node was UNREGISTERED (never registered before), remove their balance
        // from the unregistered pool — they are now opting in to the protocol.
        if (!everRegistered[node]) {
            uint256 bal = balanceOf(node);
            if (bal > 0) totalUnregisteredSupply -= bal;
            everRegistered[node] = true;
            lastDividendPerToken[node] = dividendPerToken;
            emit NodeRegistered(node, block.timestamp);
        }
        nodeStates[node].lastActivityTimestamp = block.timestamp;
        // Only write claim fields if they differ — avoids ~5,800 gas wasted on cold SSTOREs
        // during every transfer (99.9% of calls have no pending claim).
        if (nodeStates[node].successorClaimInitiated) {
            nodeStates[node].successorClaimInitiated  = false;
            nodeStates[node].claimInitiationTimestamp = 0;
        }
        emit ActivityConfirmed(node, block.timestamp);
    }

    /**
     * @dev Add tokens to dividend pool. O(1) — no loops.
     * Uses per-token accumulator pattern (like Synthetix staking rewards).
     *
     * eligibleSupply = totalSupply - balance(_from) - balance(contract) - totalUnregisteredSupply
     *
     * _from is the abandoned node whose state was deleted before this call.
     * After deletion _isUnregistered(_from) == true, so their balance appears in
     * totalUnregisteredSupply. We subtract fromInUnreg to avoid double-counting
     * (their balance is excluded both via balanceOf(_from) and via totalUnregisteredSupply).
     *
     * If eligibleSupply == 0 (no registered holders): burns tokens and emits
     * DividendsBurnedNoEligibleHolders instead of distributing to an empty pool.
     */
    function _addToDividendPool(address _from, uint256 _amount) internal {
        // Eligible supply = registered holders only (excludes sender, contract, and unregistered).
        // When called during recycling, everRegistered[_from] is still true at this point
        // (cleared in "Final cleanup" after all transfers), so _isUnregistered(_from) returns false
        // and fromInUnreg is 0. The _from balance is excluded via the balanceOf(_from) term below.
        // For any other caller where _isUnregistered(_from) is true, subtract their balance
        // from totalUnregisteredSupply to avoid double-counting with the balanceOf(_from) exclusion.
        uint256 fromInUnreg = _isUnregistered(_from) ? balanceOf(_from) : 0;
        uint256 eligibleSupply = totalSupply()
            - balanceOf(_from)
            - balanceOf(address(this))
            - (totalUnregisteredSupply - fromInUnreg);

        if (eligibleSupply == 0) {
            // No registered holders — burn the tokens instead of pooling
            _burn(_from, _amount);
            totalRemovedFromCirculation += _amount;
            emit DividendsBurnedNoEligibleHolders(_from, _amount);
            return;
        }

        _transfer(_from, address(this), _amount);
        dividendPerToken += (_amount * DIVIDEND_SCALE) / eligibleSupply;
        dividendPool += _amount;

        emit DividendsDistributed(_amount, dividendPerToken);
    }

    function _updateDividends(address _node) internal {
        uint256 balance = balanceOf(_node);
        // Only registered users accumulate dividends. Unregistered users have their
        // lastDividendPerToken kept at current dividendPerToken so they never build up a debt.
        if (!_isUnregistered(_node) && balance > 0 && dividendPerToken > lastDividendPerToken[_node]) {
            uint256 newDividends = (balance * (dividendPerToken - lastDividendPerToken[_node])) / DIVIDEND_SCALE;
            unclaimedDividends[_node] += newDividends;
        }
        lastDividendPerToken[_node] = dividendPerToken;
    }

    /**
     * @dev Override ERC20 transfer hook.
     *
     * KEY FIX: Any outgoing transfer from a wallet resets that wallet's
     * activity timer. This is the real "Proof of Activity" — if you're
     * sending transactions, you're alive.
     *
     * Also updates dividend checkpoints before balance changes to ensure
     * accurate proportional dividend calculations.
     */

    // ── M-01 fix: State-aware delegated spending lock ──────────────
    // Block transferFrom/burnFrom by third-party spenders when vault is
    // not ACTIVE. This protects the inheritance guarantee: inactive vault
    // balances can only go to the designated successor or be recycled.
    // UNREGISTERED addresses are excluded (normal ERC-20 behavior).
    // Internal protocol operations (completeVaultTransfer, recycleInactiveNode)
    // use _transfer directly and bypass these overrides.

    function transferFrom(address from, address to, uint256 value) public virtual override returns (bool) {
        _enforceDelegatedSpendingLock(from);
        return super.transferFrom(from, to, value);
    }

    function burnFrom(address account, uint256 value) public virtual override {
        _enforceDelegatedSpendingLock(account);
        super.burnFrom(account, value);
    }

    function _enforceDelegatedSpendingLock(address from) private view {
        VaultStatus status = getVaultStatus(from);
        if (status != VaultStatus.ACTIVE && status != VaultStatus.UNREGISTERED) {
            revert DelegatedSpendingBlocked();
        }
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        // Update dividend checkpoints BEFORE balance changes
        if (from != address(0) && from != address(this)) {
            _updateDividends(from);
        }
        if (to != address(0) && to != address(this)) {
            _updateDividends(to);
        }

        // Per-user flashloan protection: record last transfer block for sender and receiver.
        // This prevents: borrow WILL → recycle/claim in same block → repay.
        if (from != address(0) && from != address(this)) {
            lastTransferBlock[from] = block.number;
        }
        if (to != address(0) && to != address(this)) {
            lastTransferBlock[to] = block.number;
        }

        super._update(from, to, value);

        // Prevent UNREGISTERED addresses from claiming dividends earned before they held tokens.
        // DEFENSE-IN-DEPTH: On first receipt of tokens, snapshot the current dividendPerToken.
        // This is redundant for registered users (_updateDividends already handles them) and
        // for unregistered users (_performActivityConfirmation overwrites this on registration).
        // Retained as a safety net to prevent any unforeseen retroactive dividend accumulation
        // edge case. Auditors: this cannot cause incorrect dividend payouts — only prevents them.
        if (to != address(0) && to != address(this) && balanceOf(to) == value) {
            // balanceOf(to) == value means this is their first ever balance (was 0 before transfer)
            lastDividendPerToken[to] = dividendPerToken;
        }

        // Auto-confirm activity for sender (Proof of Activity).
        // Only DIRECT transfers (msg.sender == from) reset the timer.
        // transferFrom() by an approved spender does NOT reset — this prevents
        // allowance-based timer griefing (M-01) where a third party keeps a vault
        // alive indefinitely via small transferFrom() calls.
        //
        // Smart wallets (Gnosis Safe, ERC-4337) are fully supported because they
        // call transfer() directly (msg.sender = the smart account itself).
        // DEX swaps via allowance/transferFrom do NOT count as activity — users
        // should call confirmActivity() explicitly if they want to prove liveness.
        if (from != address(0) && from != address(this) && msg.sender == from) {
            // Only reset timer for already-registered users (opted in explicitly).
            // Do NOT auto-register on first transfer — registration must be intentional.
            if (nodeStates[from].lastActivityTimestamp > 0) {
                _performActivityConfirmation(from);
            }
        }

        // Maintain totalUnregisteredSupply: sum of balances of all UNREGISTERED addresses.
        // Must run AFTER super._update() so balanceOf() reflects the new balances.
        // _isUnregistered checks lastActivityTimestamp == 0 (after any auto-confirm above).
        if (_isUnregistered(from)) {
            totalUnregisteredSupply -= value;
        }
        if (_isUnregistered(to)) {
            totalUnregisteredSupply += value;
        }

    }

    // ============ Admin Functions ============

    /**
     * @notice Propose a new protocol treasury address (step 1 of 2-step change).
     * @dev Starts a 2-day timelock. Execute with executeTreasuryChange() after delay.
     *      Protects against a single compromised key instantly redirecting protocol fees.
     * @param _newTreasury The proposed new treasury address
     */
    function proposeTreasuryChange(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert TreasuryCannotBeZero();
        if (_newTreasury == address(this)) revert TreasuryCannotBeContract();
        pendingTreasury = _newTreasury;
        pendingTreasuryEffectiveAt = block.timestamp + TREASURY_CHANGE_DELAY;
        emit TreasuryChangeProposed(_newTreasury, pendingTreasuryEffectiveAt);
    }

    /**
     * @notice Execute a pending treasury change after the 2-day timelock has expired.
     * @dev Reverts if no proposal is pending or timelock has not elapsed.
     */
    function executeTreasuryChange() external onlyOwner {
        if (pendingTreasury == address(0)) revert NoPendingTreasuryChange();
        if (block.timestamp < pendingTreasuryEffectiveAt) revert TimelockActive();
        address old = protocolTreasury;
        protocolTreasury = pendingTreasury;
        pendingTreasury = address(0);
        pendingTreasuryEffectiveAt = 0;
        emit TreasuryUpdated(old, protocolTreasury);
    }

    /**
     * @notice Cancel a pending treasury change proposal.
     * @dev Can be called any time before executeTreasuryChange().
     */
    function cancelTreasuryChange() external onlyOwner {
        if (pendingTreasury == address(0)) revert NoPendingTreasuryChange();
        address cancelled = pendingTreasury;
        pendingTreasury = address(0);
        pendingTreasuryEffectiveAt = 0;
        emit TreasuryChangeCancelled(cancelled);
    }

    /**
     * @dev Disable renounceOwnership to prevent accidental permanent loss of admin access.
     *      Renouncing would permanently disable proposeTreasuryChange and recoverDividendDust.
     *      To fully decentralize, use a Gnosis Safe as the owner instead.
     */
    function renounceOwnership() public pure override {
        revert OwnershipRenouncementDisabled();
    }

    /**
     * @notice Recover dust tokens locked in the contract due to division truncation.
     * @dev Capped at 0.1% of totalSupply per call to limit blast radius if accounting is ever wrong.
     *      Dust accumulates slowly from integer division in _addToDividendPool, so this cap is generous.
     */
    function recoverDividendDust() external onlyOwner nonReentrant {
        uint256 totalContractBalance = balanceOf(address(this));
        if (totalContractBalance <= dividendPool) revert NoDustAvailable();

        uint256 dust = totalContractBalance - dividendPool;
        uint256 cap = totalSupply() / 1000; // 0.1% of current supply
        if (dust > cap) dust = cap;

        address destination = protocolTreasury != address(0) ? protocolTreasury : owner();

        _transfer(address(this), destination, dust);
        emit DividendDustRecovered(destination, dust);
    }

}
