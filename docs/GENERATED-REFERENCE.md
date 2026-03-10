# WillChain Contract Reference

> **Auto-generated** by `scripts/generate-docs.js` from `contracts/WillChain.sol`.
> Do not edit manually — run `node scripts/generate-docs.js` to regenerate.

Generated: 2026-03-10

---

## Constants

| Name | Type | Value |
|------|------|-------|
| `PERIOD_30_DAYS` | uint256 | `30 days` |
| `PERIOD_90_DAYS` | uint256 | `90 days` |
| `PERIOD_180_DAYS` | uint256 | `180 days` |
| `PERIOD_365_DAYS` | uint256 | `365 days` |
| `DEFAULT_INACTIVITY_PERIOD` | uint256 | `PERIOD_90_DAYS` |
| `GRACE_PERIOD` | uint256 | `30 days` |
| `CLAIM_PERIOD` | uint256 | `30 days` |
| `MAINTAINER_REWARD_BPS` | uint256 | `100` |
| `PROTOCOL_FEE_BPS` | uint256 | `500` |
| `BURN_BPS` | uint256 | `4700` |
| `RECYCLE_BPS` | uint256 | `4700` |
| `INITIAL_SUPPLY` | uint256 | `1_000_000_000 * 10**18` |
| `BASIC_VAULT_THRESHOLD` | uint256 | `1_000 * 10**18` |
| `FAMILY_VAULT_THRESHOLD` | uint256 | `10_000 * 10**18` |
| `LEGACY_VAULT_THRESHOLD` | uint256 | `100_000 * 10**18` |
| `TREASURY_CHANGE_DELAY` | uint256 | `2 days` |
| `COMMIT_MIN_DELAY` | uint256 | `2` |
| `COMMIT_MAX_DELAY` | uint256 | `256` |
| `COMMIT_REVEAL_WINDOW` | uint256 | `1 days` |

---

## Enums

### VaultStatus

| Index | Name |
|-------|------|
| 0 | UNREGISTERED |
| 1 | ACTIVE |
| 2 | GRACE |
| 3 | CLAIMABLE |
| 4 | ABANDONED |

---

## Events

| Event | Parameters |
|-------|-----------|
| `ActivityConfirmed` | `address indexed node, uint256 timestamp` |
| `UserActivityConfirmed` | `address indexed node, uint256 timestamp` |
| `SuccessorDesignated` | `address indexed node, address indexed successor` |
| `SuccessorClaimInitiated` | `address indexed node, address indexed successor, uint256 timestamp` |
| `SuccessorClaimCancelled` | `address indexed node` |
| `VaultAccessTransferred` | `address indexed fromNode, address indexed toNode, uint256 amount` |
| `VaultDataUpdated` | `address indexed node, bytes32 dataHash` |
| `InactivityPeriodChanged` | `address indexed node, uint256 newPeriod` |
| `DividendsClaimed` | `address indexed node, uint256 amount` |
| `DividendsDistributed` | `uint256 amount, uint256 newDividendPerToken` |
| `ProtocolFeeCollected` | `address indexed from, uint256 amount` |
| `TreasuryUpdated` | `address indexed oldTreasury, address indexed newTreasury` |
| `TreasuryChangeProposed` | `address indexed proposed, uint256 effectiveAt` |
| `TreasuryChangeCancelled` | `address indexed cancelled` |
| `NodeRegistered` | `address indexed node, uint256 timestamp` |
| `DividendDustRecovered` | `address indexed to, uint256 amount` |
| `DividendsBurnedNoEligibleHolders` | `address indexed from, uint256 amount` |
| `FrozenDividendsRecovered` | `address indexed abandonedNode, uint256 amount` |
| `RecycleCommitted` | `address indexed committer, bytes32 commitHash, uint256 commitBlock` |

---

## Public & External Functions

| Function | Visibility | Mutability | Returns |
|----------|-----------|------------|---------|
| `confirmActivity()` | external | nonpayable | `—` |
| `setInactivityPeriod(uint256 _period)` | external | nonpayable | `—` |
| `designateSuccessor(address _successor)` | external | nonpayable | `—` |
| `updateVaultData(bytes32 _dataHash)` | external | nonpayable | `—` |
| `initiateSuccessorClaim(address _node)` | external | nonpayable | `—` |
| `cancelSuccessorClaim()` | external | nonpayable | `—` |
| `completeVaultTransfer(address _node)` | external | nonpayable | `—` |
| `commitRecycle(bytes32 _commitHash)` | external | nonpayable | `—` |
| `executeRecycle(address _abandonedNode, bytes32 _salt)` | external | nonpayable | `—` |
| `recycleInactiveNode(address _abandonedNode)` | external | nonpayable | `—` |
| `claimDividends()` | external | nonpayable | `—` |
| `pendingDividends(address _node)` | external | view | `uint256` |
| `getVaultStatus(address _node)` | public | view | `VaultStatus` |
| `getTotalTimeout(address _node)` | public | view | `uint256` |
| `getInactivityPeriod(address _node)` | external | view | `uint256` |
| `getNodeState(address node)` | external | view | `—` |
| `getNetworkStatistics()` | external | view | `—` |
| `getProtocolFeeInfo()` | external | view | `—` |
| `proposeTreasuryChange(address _newTreasury)` | external | nonpayable | `—` |
| `executeTreasuryChange()` | external | nonpayable | `—` |
| `cancelTreasuryChange()` | external | nonpayable | `—` |
| `renounceOwnership()` | public | pure | `—` |
| `recoverDividendDust()` | external | nonpayable | `—` |

---

Total: 19 constants, 1 enums, 19 events, 23 public/external functions.
