# WillChain Protocol Invariants

Formal invariants that MUST hold at all times. Each invariant is tested by at least one
hardhat test, foundry fuzz test, or both.

---

## Economic Invariants

### INV-E1: Dividend Pool Solvency
```
dividendPool <= balanceOf(contract)
```
The dividend pool can never exceed the contract's actual token balance.
Any violation means dividends are promised but unbacked.

**Tested by:** `testFuzz_dividendPoolNeverExceedsContractBalance` (Foundry), `testFuzz_dividendSolvencyAfterRecycle` (Foundry), hardhat "dividend invariant after recycle"

### INV-E2: Pending Dividends Solvency
```
sum(pendingDividends(user) for all registered users) <= balanceOf(contract)
```
Total claimable dividends across all users never exceed the contract balance.

**Tested by:** `testFuzz_dividendSolvencyAfterRecycle` (Foundry)

### INV-E3: Supply Conservation
```
totalSupply_before - totalSupply_after == totalRemovedFromCirculation_delta
```
Total supply decreases ONLY by the amount explicitly burned. No tokens are created or destroyed silently.

**Tested by:** `testFuzz_supplyConservationAfterRecycle` (Foundry), hardhat "supply conservation"

### INV-E4: Recycle Distribution Completeness
```
MAINTAINER_REWARD_BPS + PROTOCOL_FEE_BPS + BURN_BPS + RECYCLE_BPS == 10000
100 + 500 + 4700 + 4700 == 10000
```
Every token from a recycled node is accounted for. No tokens are lost during recycling.

**Tested by:** Hardhat "recycle distribution" tests

### INV-E5: Unregistered Supply Tracking
```
totalUnregisteredSupply == Σ balanceOf(addr) for all addr where !everRegistered[addr]
                           (excluding address(0) and address(contract))
```
Tracks the total tokens held by users who have never registered (or were recycled/transferred out).

**Tested by:** `testFuzz_totalUnregisteredSupplyConsistency` (Foundry), `testFuzz_totalUnregisteredSupplyAfterRecycleRestore` (Foundry)

---

## Registration Invariants

### INV-R1: Unregistered Users Never Earn Dividends
```
if !everRegistered[user]: pendingDividends(user) == 0
```
A user who has never called `confirmActivity()` (or was recycled/transferred) cannot accumulate
or claim dividends, even if they hold tokens.

**Tested by:** `testFuzz_unregisteredNeverEarnsDividends` (Foundry), hardhat "UNREGISTERED cannot accumulate dividends"

### INV-R2: Registration Removes From Unregistered Supply
```
on confirmActivity() where !everRegistered[user]:
  totalUnregisteredSupply -= balanceOf(user)
  everRegistered[user] = true
  lastDividendPerToken[user] = dividendPerToken  // no retroactive earnings
```

**Tested by:** `testFuzz_totalUnregisteredSupplyConsistency` (Foundry)

### INV-R3: Re-registration After Recycle
```
After recycleInactiveNode(user):
  everRegistered[user] == false

After user receives tokens + confirmActivity():
  everRegistered[user] == true
  pendingDividends starts from 0
```

**Tested by:** `testFuzz_reRegistrationAfterRecycle` (Foundry)

---

## Timer Invariants

### INV-T1: Only Direct Transfers Reset Timer (M-01 Fix)
```
In _update(): timer resets only when msg.sender == from
transferFrom() by third-party spender does NOT reset the timer
```
This prevents a spender (DEX, protocol) from keeping a vault alive by spending its tokens.

**Tested by:** Hardhat "transferFrom does not reset timer" (M-01 tests)

### INV-T2: Setup Actions Auto-Register
```
designateSuccessor(), setInactivityPeriod(), updateVaultData(), confirmActivity()
all call _performActivityConfirmation() which:
  - registers if UNREGISTERED
  - resets lastActivityTimestamp
  - cancels any pending successor claim (except designateSuccessor which only resets timer)
```

**Tested by:** Hardhat "self-suicide" prevention tests

### INV-T3: Vault Status Derivation
```
UNREGISTERED: lastActivityTimestamp == 0
ACTIVE:       now <= lastActivity + inactivityPeriod
GRACE:        now <= lastActivity + inactivityPeriod + GRACE_PERIOD
CLAIMABLE:    now <= lastActivity + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD
ABANDONED:    now > lastActivity + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD

When successorClaimInitiated:
  timeline shifts to claimInitiationTimestamp-based
```

**Tested by:** Hardhat status derivation tests, `test/vault-status.test.js`, frontend `vaultStatus.test.ts`

---

## Successor Invariants

### INV-S1: No Circular Successor Chains
```
if designatedSuccessor[A] == B:
  designateSuccessor(B, A) MUST revert "Circular successor chain"
```
Prevents mutual designation deadlocks.

**Tested by:** `testFuzz_circularSuccessorAlwaysBlocked` (Foundry), hardhat "circular successor" tests

### INV-S2: Successor Cannot Be Self, Zero, or Contract
```
designateSuccessor(msg.sender) → revert
designateSuccessor(address(0)) → revert
designateSuccessor(address(this)) → revert
```

**Tested by:** Hardhat "designateSuccessor guards"

### INV-S3: Claim Window Boundaries
```
initiateSuccessorClaim() blocked if:
  - node is still ACTIVE (timer hasn't expired)
  - node is ABANDONED (too late, missed the window)
  - claim already initiated

completeVaultTransfer() blocked if:
  - veto window hasn't passed
  - claim window has expired (ABANDONED)
  - flashloan guard: lastTransferBlock[successor] < block.number
```

**Tested by:** Hardhat successor claim lifecycle tests

---

## MEV Protection Invariants

### INV-M1: Fresh Abandoned Requires Commit-Reveal
```
if node became ABANDONED < COMMIT_REVEAL_WINDOW (24h) ago:
  recycleInactiveNode(node) MUST revert "Use commit-reveal for recently abandoned nodes"
  must use commitRecycle() + executeRecycle() instead
```

**Tested by:** `testFuzz_freshAbandonedBlocksDirectRecycle` (Foundry), hardhat commit-reveal tests

### INV-M2: Commit-Reveal Hash Integrity
```
commitHash == keccak256(abi.encodePacked(abandonedNode, salt, msg.sender))
executeRecycle() with wrong salt or wrong caller → revert
```

**Tested by:** `testFuzz_commitRevealHashIntegrity` (Foundry), hardhat "wrong salt/wrong caller" tests

### INV-M3: Commit-Reveal Block Delay
```
COMMIT_MIN_DELAY (2) <= block.number - commitBlock <= COMMIT_MAX_DELAY (256)
Too early → revert
Too late → revert
```

**Tested by:** Hardhat "too early" / "too late" commit-reveal tests

### INV-M4: Flashloan Guard
```
recycleInactiveNode / completeVaultTransfer:
  lastTransferBlock[caller/successor] < block.number

No minting or receiving tokens + recycling/claiming in the same block.
```

**Tested by:** Hardhat flashloan guard tests

---

## Admin Invariants

### INV-A1: Treasury Timelock
```
Treasury change requires 2 steps separated by >= 2 days:
  1. proposeTreasuryChange(newAddress) — sets pendingTreasury + timestamp
  2. executeTreasuryChange() — applies after TREASURY_CHANGE_DELAY (2 days)
  cancelTreasuryChange() — reverts pending at any time
```

**Tested by:** Hardhat treasury timelock tests

### INV-A2: Ownership Transfer (Ownable2Step)
```
transferOwnership(newOwner) — sets pendingOwner
acceptOwnership() — newOwner must explicitly accept
renounceOwnership() — always reverts "Ownership renouncement disabled"
```

**Tested by:** Hardhat Ownable2Step tests

### INV-A3: Dividend Dust Recovery Cap
```
recoverDividendDust() — at most 0.1% of totalSupply per call
  maxDust = totalSupply / 1000
  actualDust = min(dividendPool, maxDust)
```

**Tested by:** Hardhat "recoverDividendDust" tests

---

## Cross-Layer Consistency

### INV-X1: Shared Status Logic
```
shared/vault-status.js deriveVaultStatus(state) MUST produce the same
status classification as WillChain.sol getVaultStatus(address)
for all reachable state combinations.
```

**Tested by:** `test/vault-status.test.js` semantic regression suite

### INV-X2: ABI Consistency
```
frontend-react/src/config/contract.ts WILLCHAIN_ABI must match
the deployed contract's ABI for all functions used by the frontend.
```

**Tested by:** CI config-drift checks

### INV-X3: Constants Consistency
```
GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS, COMMIT_REVEAL_WINDOW
in contract.ts must equal the contract's compile-time constants.
```

**Tested by:** CI config-drift checks

---

## State Machine Completeness

```
States: {UNREGISTERED, ACTIVE, GRACE, CLAIMABLE, ABANDONED}

Valid transitions:
  UNREGISTERED → ACTIVE          (register)
  ACTIVE       → GRACE           (inactivity expires)
  ACTIVE       → ACTIVE          (confirm activity, designate successor)
  GRACE        → ACTIVE          (owner confirms activity or cancels claim)
  GRACE        → CLAIMABLE       (veto window passes after claim initiated)
  GRACE        → ABANDONED       (total timeout without claim)
  CLAIMABLE    → ACTIVE          (owner cancels claim or confirms activity)
  CLAIMABLE    → UNREGISTERED    (successor completes transfer)
  CLAIMABLE    → ABANDONED       (claim window expires)
  ABANDONED    → UNREGISTERED    (recycled by anyone)

Invalid transitions (must never happen):
  UNREGISTERED → GRACE/CLAIMABLE/ABANDONED  (no timer to expire)
  ABANDONED    → ACTIVE/GRACE/CLAIMABLE     (must recycle first, then re-register)
```
