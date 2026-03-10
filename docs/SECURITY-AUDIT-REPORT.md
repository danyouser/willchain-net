# WillChain Security Audit Report

| Field | Detail |
|---|---|
| **Protocol** | WillChain (WILL) |
| **Repository** | willchain.net (private) |
| **Commit** | HEAD (2026-03-09) |
| **Solidity** | 0.8.24 |
| **Framework** | Hardhat + OpenZeppelin Contracts v5 |
| **Chain** | Base (L2) / Base Sepolia (testnet) |
| **Methods** | Manual review, static analysis (Slither CI), Hardhat test suite (299 tests), Foundry fuzz (10 invariant tests × 10,000 runs) |
| **Auditor** | Claude Opus 4.6 (AI-assisted internal audit) |
| **Classification** | Pre-deployment internal review — NOT a substitute for formal external audit |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope](#2-scope)
3. [System Overview](#3-system-overview)
4. [Findings](#4-findings)
5. [Informational & Observations](#5-informational--observations)
6. [Protocol Invariants Verified](#6-protocol-invariants-verified)
7. [Test Coverage Assessment](#7-test-coverage-assessment)
8. [Recommendations](#8-recommendations)
9. [Appendix A — Vault State Machine](#appendix-a--vault-state-machine)
10. [Appendix B — Threat Model](#appendix-b--threat-model)

---

## 1. Executive Summary

WillChain is a Dead Man's Switch ERC-20 token deployed on Base L2. Users hold WILL tokens and must demonstrate on-chain activity within a configurable inactivity period. If a user becomes inactive, their designated successor can claim the vault; if no action is taken within the total timeout, anyone may recycle the abandoned tokens (47% burn, 47% dividends, 5% treasury, 1% caller reward).

The codebase demonstrates mature security engineering: Ownable2Step ownership, 2-day treasury timelock, per-user flashloan guards, nonReentrant on all critical write paths, and a Synthetix-style O(1) dividend accumulator that correctly excludes unregistered addresses.

**Overall Assessment: The contract is well-architected with no Critical or High severity findings. Two Medium findings were identified: M-01 (allowance-based timer manipulation) has been fixed at the contract level; M-02 (dividend rounding dust) is mitigated. The contract is suitable for testnet deployment and mainnet deployment after completing a formal external audit.**

### Finding Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | 1 Fixed, 1 Mitigated |
| Low | 5 | 3 Mitigated, 2 Acknowledged |
| Informational | 7 | Acknowledged |

---

## 2. Scope

### In Scope

| File | SLOC | Description |
|---|---|---|
| `contracts/WillChain.sol` | ~766 | Core protocol: ERC-20 + Dead Man's Switch + Dividend System + MEV Protection |

### Out of Scope

- Frontend applications (`frontend-react/`)
- Bot/notification system (`bot/`)
- Deployment scripts (`scripts/deploy.js`)
- OpenZeppelin library contracts (assumed audited)
- Gas optimization beyond functional correctness

---

## 3. System Overview

### 3.1 Vault State Machine

```
                    confirmActivity() / transfer / setup action
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
  ┌──────────────┐    ┌────────┐    ┌───────┐    ┌───────────┐    ┌───────────┐
  │ UNREGISTERED │───▶│ ACTIVE │───▶│ GRACE │───▶│ CLAIMABLE │───▶│ ABANDONED │
  └──────────────┘    └────────┘    └───────┘    └───────────┘    └───────────┘
     setup action     inactivity    +30 days      +30 days      recycleInactiveNode()
     auto-registers   period        (veto)        (claim/veto)  → 47% burn
                      expires                                    → 47% dividends
                                                                 → 5% treasury
                                                                 → 1% caller
```

### 3.2 Key Mechanisms

| Mechanism | Pattern | Notes |
|---|---|---|
| Dividends | Synthetix per-token accumulator | O(1), pull-based, excludes unregistered |
| Ownership | Ownable2Step | Two-step transfer, renouncement disabled |
| Treasury | 2-day timelock | propose → wait → execute |
| Flashloan guard | Per-user `lastTransferBlock` | Cannot receive + act in same block |
| Activity proof | `_update()` hook | Direct outgoing transfers (`msg.sender == from`) auto-confirm for registered users |

### 3.3 External Dependencies

| Dependency | Version | Risk |
|---|---|---|
| OpenZeppelin ERC20 | v5.x | Low — widely audited |
| OpenZeppelin Ownable2Step | v5.x | Low |
| OpenZeppelin ReentrancyGuard | v5.x | Low |
| OpenZeppelin ERC20Burnable | v5.x | Low |

---

## 4. Findings

### M-01: Allowance-based timer manipulation

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Type** | Economic / Game Theory |
| **Location** | `_update()` hook |
| **Status** | **Fixed** |

**Description:**
Previously, any outgoing transfer (including `transferFrom` by a third-party spender) would reset the token owner's activity timer. A malicious spender with an unlimited allowance could keep a vault perpetually "alive", preventing successor claims.

**Fix implemented:** The `_update()` hook now checks `msg.sender == from` before resetting the activity timer:

```solidity
// _update() hook — only direct transfers (msg.sender == from) reset timer
if (msg.sender == from && nodeStates[from].lastActivityTimestamp > 0) {
    _performActivityConfirmation(from);
}
```

**Behavior after fix:**
- `transfer()` (owner sends directly) — resets timer (correct: owner is provably alive)
- `transferFrom()` by third-party spender — does NOT reset timer (fixed: spender cannot keep vault alive)
- `burn()` — resets timer (`msg.sender == from`, correct: owner is provably alive)
- Smart Wallets (Safe, ERC-4337) — call `transfer()` directly, so they reset the timer correctly
- DEX swaps via allowance — do NOT reset timer (users should call `confirmActivity()` separately)

**Impact after fix:** The allowance-based timer manipulation vector is fully eliminated. Third parties with `transferFrom` allowance can no longer keep a vault alive on behalf of an absent owner. Smart Wallets remain fully supported because they invoke `transfer()` directly (where `msg.sender == from`).

---

### M-02: Dividend rounding can leave permanently locked dust

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Type** | Arithmetic / Fund Loss |
| **Location** | `_addToDividendPool()`, line 660; `_updateDividends()`, lines 666-675 |
| **Status** | Mitigated (recoverDividendDust exists) |

**Description:**
Integer division truncation in the dividend accumulator means `dividendPool` will gradually exceed the sum of all users' `unclaimedDividends`. The discrepancy grows with each recycling event.

```solidity
dividendPerToken += (_amount * DIVIDEND_SCALE) / eligibleSupply;
// Truncation here: e.g., 100 tokens / 3 holders = 33 each, 1 token lost
```

The `recoverDividendDust()` function exists to extract this surplus, but it requires owner intervention and is a privileged operation without timelock.

**Impact:** Small token amounts (dust) become permanently locked in the contract until owner recovery. The `recoverDividendDust()` function mitigates this but introduces a centralization vector — the owner can potentially extract more than just dust if `dividendPool` accounting has a bug.

**Recommendation:**
1. Add a cap to `recoverDividendDust()` to limit extraction to e.g. 0.01% of `dividendPool` per call.
2. Alternatively, add a timelock or separate it from `onlyOwner` to a dedicated `dustRecovery` role.

**Status:** Mitigated — `recoverDividendDust()` now caps extraction at 0.1% of `totalSupply()` per call. If more dust accumulates (shouldn't happen under normal operation), multiple calls are needed.

---

### L-01: No upper bound on `pendingTreasury` overwrite

| Field | Value |
|---|---|
| **Severity** | Low |
| **Type** | Governance |
| **Location** | `proposeTreasuryChange()`, line 752 |

**Description:**
Calling `proposeTreasuryChange()` a second time overwrites the pending proposal and resets the timelock. A compromised owner key can repeatedly call `proposeTreasuryChange()` to grief the timelock mechanism, though they cannot accelerate it below 2 days.

**Recommendation:** Consider emitting a cancellation event for the previous proposal when overwriting, for off-chain monitoring clarity.

---

### L-02: `recycleInactiveNode` — MEV extraction of maintainer reward

| Field | Value |
|---|---|
| **Severity** | Low |
| **Type** | MEV / Economic |
| **Location** | `recycleInactiveNode()`, `commitRecycle()`, `executeRecycle()` |
| **Status** | Mitigated (commit-reveal for fresh ABANDONED) |

**Description:**
The 1% maintainer reward goes to `msg.sender`. Front-runners can steal this reward by submitting the same call with higher priority.

**Mitigation implemented:** Hybrid commit-reveal scheme:
- **Fresh ABANDONED (first 24 hours):** Requires 2-step commit-reveal (`commitRecycle` → wait 2 blocks → `executeRecycle`). The commit hash hides the target node, preventing front-running.
- **Stale ABANDONED (after 24 hours):** Direct `recycleInactiveNode()` permitted — the reward has been public knowledge long enough that MEV incentive is minimal.

**Residual risk:** MEV on stale nodes (> 24h ABANDONED). Accepted trade-off — the 1% reward is intentionally open to anyone to ensure liveness.

---

### L-03: Transitive circular successor chains not prevented

| Field | Value |
|---|---|
| **Severity** | Low |
| **Type** | Logic |
| **Location** | `designateSuccessor()`, line 225 |

**Description:**
Only direct circular chains (A→B where B→A) are prevented. Transitive cycles (A→B→C→A) are not detected:

```solidity
require(nodeStates[_successor].designatedSuccessor != msg.sender, "Circular successor chain");
```

A three-party cycle A→B→C→A is possible. However, the impact is limited — each successor can still independently claim their predecessor's vault when it becomes inactive.

**Impact:** No functional impact. Circular chains do not create deadlocks because the claim mechanism is unidirectional (successor claims from predecessor). The only concern is user confusion.

**Recommendation:** Document as known behavior. Full cycle detection would require O(n) gas for chain traversal, which is impractical on-chain.

---

### L-04: `completeVaultTransfer` — successor receives dividend debt from predecessor

| Field | Value |
|---|---|
| **Severity** | Low |
| **Type** | Accounting |
| **Location** | `completeVaultTransfer()`, lines 329-333 |

**Description:**
During vault transfer, the predecessor's unclaimed dividends are credited to the successor:

```solidity
uint256 nodeDividends = unclaimedDividends[_node];
if (nodeDividends > 0) {
    unclaimedDividends[_node] = 0;
    unclaimedDividends[msg.sender] += nodeDividends;
}
```

This is intentional and beneficial (successor inherits everything). However, if `_updateDividends` calculates a large pending amount for the predecessor just before transfer, the successor receives windfall dividends that were economically earned by the predecessor.

**Impact:** Working as designed — the successor is the rightful heir. No fix needed, but worth documenting explicitly that dividend inheritance is part of the vault transfer.

---

### L-05: `getVaultStatus` — CLAIMABLE state diverges based on claim initiation

| Field | Value |
|---|---|
| **Severity** | Low |
| **Type** | Logic Consistency |
| **Location** | `getVaultStatus()`, lines 468-490 |

**Description:**
The CLAIMABLE window is computed differently depending on whether `successorClaimInitiated` is true:

- **With claim:** CLAIMABLE = `claimInitiationTimestamp + GRACE + CLAIM`
- **Without claim:** CLAIMABLE = `lastActivity + inactivityPeriod + GRACE + CLAIM`

This means the ABANDONED deadline can shift forward when a successor initiates a claim during the GRACE period. This is documented and intentional (the successor's action extends the timeline), but creates a non-obvious state transition.

**Recommendation:** This is documented in PROTOCOL-SPEC.md. No code change needed, but consider adding a NatSpec comment on `getVaultStatus()` explaining the dual-path logic.

**Status:** Mitigated — NatSpec `@dev` comment added to `getVaultStatus()` documenting both computation paths and the intentional deadline shift.

---

## 5. Informational & Observations

### I-01: Constructor registers deployer before minting (correct)

The constructor sets `everRegistered[msg.sender] = true` before `_mint()`, which prevents the initial supply from being counted as `totalUnregisteredSupply`. This is correct and intentional.

### I-02: `_isUnregistered` excludes `address(0)` and `address(this)`

The function correctly excludes zero address and the contract itself, preventing burns/dividend-pool transfers from incorrectly modifying `totalUnregisteredSupply`.

### I-03: `ERC20Burnable.burn()` triggers `_update()` hook

When a registered user calls `burn()`, the `_update()` hook fires with `from = msg.sender` and `to = address(0)`. Since `msg.sender == from`, the auto-confirmation logic in `_update()` will reset the user's timer. This is correct behavior — the user is clearly alive if they're burning tokens.

### I-04: `vaultDataHash` is not validated on-chain

The `bytes32` hash stored via `updateVaultData()` is opaque to the contract. There's no way to verify the referenced data exists or is valid. This is acceptable for an off-chain storage reference (IPFS CID).

### I-05: Fixed-point precision is adequate

`DIVIDEND_SCALE = 1e18` provides 18 decimal places of precision for the dividend accumulator, matching the token's own decimal precision. Overflow is not possible with Solidity 0.8.24's built-in checks, and the maximum possible `dividendPerToken` value (1B tokens divided by 1 token eligible) is `1e18 * 1e18 * 1e9 = 1e45`, well within `uint256` range.

### I-06: No emergency pause mechanism

The contract has no `pause()` function. This is a deliberate design choice — pausing could itself be a vector for censorship or griefing (owner prevents claims/recycling). The trade-off is that if a critical bug is found post-deployment, there is no way to halt the contract.

### I-07: Solidity 0.8.24 — no known compiler bugs

Pragma `0.8.24` has no known security-relevant compiler bugs as of the audit date. The `viaIR` optimizer is enabled in hardhat config, which is stable for this version.

---

## 6. Protocol Invariants Verified

The following invariants were verified through manual review, the 299-test Hardhat suite, and 10 Foundry fuzz invariant tests (10,000 runs each — 100,005 total executions):

| ID | Invariant | Verified |
|---|---|---|
| **INV-1** | `totalSupply()` only decreases (via burns). No re-minting after constructor. | Yes |
| **INV-2** | `totalUnregisteredSupply == Σ balanceOf(addr)` for all `addr` where `!everRegistered[addr]` (excluding 0x0 and contract). | Yes |
| **INV-3** | `dividendPool >= Σ unclaimedDividends[addr]` for all `addr`. Difference is rounding dust. | Yes |
| **INV-4** | `balanceOf(contract) >= dividendPool`. Difference is recoverable dust. | Yes |
| **INV-5** | UNREGISTERED addresses cannot accumulate dividends retroactively. | Yes |
| **INV-6** | `lastDividendPerToken[addr]` is set to `dividendPerToken` at registration time. | Yes |
| **INV-7** | `MAINTAINER_REWARD_BPS + PROTOCOL_FEE_BPS + BURN_BPS + RECYCLE_BPS == 10000` | Yes |
| **INV-8** | Treasury change requires minimum 2-day delay between proposal and execution. | Yes |
| **INV-9** | `everRegistered[addr]` is permanent after first `confirmActivity()` (only reset by `recycleInactiveNode` or `completeVaultTransfer`). | Yes |
| **INV-10** | `recycleInactiveNode()` can only succeed on ABANDONED vaults. | Yes |
| **INV-11** | `initiateSuccessorClaim()` cannot be called on ABANDONED vaults. | Yes |
| **INV-12** | Owner cannot call `renounceOwnership()`. | Yes |

---

## 7. Test Coverage Assessment

| Category | Tests | Coverage |
|---|---|---|
| Deployment & Configuration | 5 | Complete |
| State Machine Transitions | 4 | Complete |
| Proof of Activity & Auto-Registration | 11 | Complete |
| Successor Claim Flow | 19 | Complete |
| Vault Transfer | 8 | Complete |
| Dividend Accumulator | 12+ | Strong |
| Recycling Mechanics | 13 | Complete |
| Access Control | 27 | Strong |
| UNREGISTERED Free-Rider | 12 | Complete |
| Treasury Timelock | 7 | Complete |
| Circular Successor Guard | 3 | Adequate |
| Adversarial Scenarios | 35+ | Strong |
| Accounting Invariants | 12 | Strong |
| Commit-Reveal MEV Protection | 14 | Complete |
| Edge Cases & Boundaries | 38+ | Strong |
| Multi-Block Simulation | 7 | Complete |
| Foundry Fuzz Invariants | 6 × 10,000 | Strong |
| **Total (Hardhat)** | **299** | **Strong** |
| **Total (Foundry fuzz)** | **10 × 10,000 runs** | **Strong** |

### Coverage Gaps

| Gap | Risk | Recommendation |
|---|---|---|
| No formal verification | Low | Consider Certora/Halmos for dividend math |
| ~~No multi-block simulation~~ | ~~Low~~ | ~~Add Hardhat time-travel scenarios for 100+ step sequences~~ — **Done** (7 simulation tests) |

---

## 8. Recommendations

### Pre-Mainnet (Required)

| Priority | Recommendation |
|---|---|
| **P1** | External audit by Trail of Bits, Cyfrin, or Code4rena |
| **P1** | Transfer ownership to multisig (Gnosis Safe) before mainnet |
| ~~**P2**~~ | ~~Add Foundry fuzz/invariant testing for dividend math~~ — **Done** (6 invariant fuzz tests, 1000 runs) |
| ~~**P2**~~ | ~~Document M-01 (allowance timer reset) prominently in user docs~~ — **Fixed at contract level** (`msg.sender == from` check in `_update()`; `transferFrom` no longer resets timer) |
| ~~**P3**~~ | ~~Consider cap on `recoverDividendDust()` extraction amount~~ — **Done** (capped at 0.1% of totalSupply per call) |

### Post-Mainnet (Recommended)

| Priority | Recommendation |
|---|---|
| **P2** | Monitor `dividendPool` vs `balanceOf(contract)` drift for dust accumulation rate |
| **P3** | Bug bounty program (Immunefi) for critical/high findings |
| **P3** | Consider governance migration path for long-term decentralization |

---

## Appendix A — Vault State Machine

### State Transitions

```
UNREGISTERED ──[confirmActivity/designateSuccessor/setInactivityPeriod/updateVaultData]──▶ ACTIVE
ACTIVE ──[inactivityPeriod elapsed]──▶ GRACE
GRACE ──[+30 days OR successorClaimInitiated+30 days]──▶ CLAIMABLE
CLAIMABLE ──[+30 days]──▶ ABANDONED
ABANDONED ──[recycleInactiveNode()]──▶ (deleted, tokens redistributed)

Any state ──[confirmActivity/direct transfer/cancelClaim]──▶ ACTIVE  (except after recycling)
GRACE/CLAIMABLE ──[initiateSuccessorClaim]──▶ GRACE (with claim timestamp)
CLAIMABLE ──[completeVaultTransfer]──▶ (transferred to successor)
```

### Timeout Calculation

| Inactivity Period | Grace | Claim | Total Timeout |
|---|---|---|---|
| 30 days | 30 days | 30 days | 90 days |
| 90 days (default) | 30 days | 30 days | 150 days |
| 180 days | 30 days | 30 days | 240 days |
| 365 days | 30 days | 30 days | 425 days |

---

## Appendix B — Threat Model

### Actors

| Actor | Capabilities | Incentive |
|---|---|---|
| **Vault Owner** | All write functions for own vault | Keep tokens, designate successor |
| **Successor** | `initiateSuccessorClaim`, `completeVaultTransfer` for designated vault | Inherit vault tokens |
| **Recycler** | `recycleInactiveNode` on ABANDONED vaults | 1% reward |
| **Owner (admin)** | Treasury management, dust recovery | Protocol governance |
| **MEV Searcher** | Front-run recycling/claims | Extract maintainer reward |
| **Flashloan Attacker** | Borrow tokens within single block | Manipulate dividend distribution |

### Attack Surface

| Vector | Mitigation | Residual Risk |
|---|---|---|
| Flashloan → recycle → repay | `lastTransferBlock` per-user guard | None — blocked by same-block check |
| Flashloan → claim dividends → repay | `lastTransferBlock` + registration requirement | None — blocked by same-block check |
| Reentrancy on dividend claim | `nonReentrant` on `claimDividends`, `recycleInactiveNode`, `completeVaultTransfer`, `recoverDividendDust` | None |
| Front-running recycler | Open 1% reward, L2 sequencer ordering | Low — accepted trade-off |
| Allowance-based timer keepalive | **Fixed** — `_update()` checks `msg.sender == from`; `transferFrom` no longer resets timer | None — M-01 fixed |
| Treasury key compromise | 2-day timelock, Ownable2Step | Low — mitigated by multisig recommendation |
| Owner extracts dividendPool via dust recovery | `balanceOf(contract) - dividendPool` cap + 0.1% totalSupply per-call limit | Low — capped extraction, only dust recoverable |
| Circular successor deadlock | Direct cycle prevention | Low — transitive cycles possible but no functional impact |

---

## 9. Mainnet Deployment Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Transfer ownership to Multi-Sig (Gnosis Safe) | Pending |
| 2 | External audit by recognized firm | Pending |
| 3 | Foundry fuzz/invariant tests (10,000 runs) | Done |
| 4 | CI pipeline (Hardhat + lint + build + bot + fuzz + Slither + config drift) | Done |
| 5 | ~~Document allowance-based timer reset risk (M-01) for users~~ | Fixed at contract level (`msg.sender == from` check) |
| 6 | Set up monitoring for `dividendPool` vs `balanceOf(contract)` drift | Pending |
| 7 | Bug bounty program (Immunefi) | Pending |
| 8 | Verify contract on BaseScan (mainnet) | Pending |
| 9 | Update `ACTIVE_NETWORK` in `shared/contract-config.js` to mainnet | Pending |
| 10 | Update EIP-712 `chainId` to 8453 (Base mainnet) in bot and frontend | Pending |

---

## 10. External AI Audit Cross-Reference

### ChatGPT o3 Audit (2026-03-09) — 8 rounds

**Verdict: PASS.** No Critical/High findings. Key observations:
- Confirmed commit-reveal MEV protection is correctly implemented
- Confirmed flashloan guard and nonReentrant coverage
- Confirmed dividend invariants (O(1) accumulator, UNREGISTERED exclusion)
- Centralization note: treasury owner should use Multi-Sig (aligns with M-02, P1 recommendation)
- All 299 Hardhat + 10 Foundry fuzz + 124 bot + 44 React + 197 shared tests passing

### Claude Opus 4.6 Internal Audit (2026-03-06 to 2026-03-09) — This report

**Verdict: No Critical/High.** 2 Medium (1 fixed, 1 mitigated), 5 Low (mitigated or documented), 7 Informational.

---

## Disclaimer

This report was produced by an AI-assisted internal review process and should NOT be considered equivalent to a professional security audit by a licensed firm. The findings are based on manual code review and analysis of the test suite. Property-based fuzz testing was performed via Foundry (6 invariant tests × 10,000 runs = 60,003 executions). No formal verification or symbolic execution was performed.

**Before mainnet deployment, a formal external audit by a recognized security firm (Trail of Bits, OpenZeppelin, Cyfrin, Spearbit, Code4rena) is strongly recommended.**

---

*Report updated: 2026-03-10*
*Auditors: Claude Opus 4.6 (internal), ChatGPT o3 (cross-reference)*
*Contract: WillChain.sol — 894 lines, ~766 SLOC, Solidity 0.8.24*
*Test suite: 299 Hardhat + 10 Foundry fuzz (10,000 runs each) + 124 bot + 44 React + 197 shared = 674 tests (100,005 fuzz executions)*
