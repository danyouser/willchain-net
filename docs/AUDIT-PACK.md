# WillChain — External Audit Pack

| Field | Detail |
|-------|--------|
| **Protocol** | WillChain (WILL) — Dead Man's Switch ERC-20 |
| **Chain** | Base Sepolia (testnet) → Base (mainnet) |
| **Solidity** | 0.8.24 (pinned) |
| **Framework** | Hardhat + OpenZeppelin Contracts v5 |
| **Contract** | [`contracts/WillChain.sol`](../contracts/WillChain.sol) — 968 lines, ~500 SLOC |
| **Testnet Address** | `0x6fAd1475B41731E3eDA21998417Cb2e18E795877` |
| **Last Updated** | 2026-03-10 |
| **Security Contact** | security@willchain.net |

---

## 1. Executive Summary

WillChain is a Dead Man's Switch ERC-20 token on Base L2. Users hold WILL tokens and must demonstrate on-chain activity within a configurable inactivity period (90–365 days). If a user becomes inactive, their designated successor can claim the vault after a 30-day veto window. If no one acts within the total timeout (inactivity + 30d grace + 30d claim), anyone may recycle the abandoned tokens via a deterministic split: 47% burn, 47% dividends to active holders, 5% treasury, 1% caller reward.

The contract uses a Synthetix-style O(1) dividend accumulator, Ownable2Step ownership, 2-day treasury timelock, per-user flashloan guards, and commit-reveal MEV protection for recycling.

**Audit request:** We seek a comprehensive review of the smart contract for correctness, security, and economic soundness. All known issues from internal audits have been resolved. We want external validation before mainnet deployment.

---

## 2. Architecture Overview

### State Machine

```
UNREGISTERED (0)
    │  confirmActivity() / direct transfer / setup action
    ▼
  ACTIVE (1) ◄──────────────────────────────────────────────┐
    │  time passes (> inactivityPeriod)                      │ cancelSuccessorClaim()
    ▼                                                        │ confirmActivity()
  GRACE (2)                                                  │ designateSuccessor()
    │  initiateSuccessorClaim()                              │ updateVaultData()
    ▼                                                        │ setInactivityPeriod()
  CLAIMABLE (3) ────────────────────────────────────────────┘
    │  completeVaultTransfer() (after 30-day veto window)
    ▼
  [Vault transferred — owner node DELETED]

  GRACE (2) or CLAIMABLE (3)
    │  time passes (> total timeout)
    ▼
  ABANDONED (4)
    │  recycleInactiveNode() [commit-reveal if < 24h]
    ▼
  [Node DELETED — tokens redistributed — address returns to UNREGISTERED]
```

### Token Economics

| Event | Burn | Dividends | Treasury | Caller |
|-------|------|-----------|----------|--------|
| Recycle | 47% | 47% | 5% | 1% |

- **Dividends** are distributed proportionally to all registered holders via O(1) accumulator
- **Unregistered** addresses (holding tokens but never checked in) are excluded from dividends
- **Total supply** can only decrease (no minting after deployment)

### Key Mechanisms

| Mechanism | Pattern | Reference |
|-----------|---------|-----------|
| Dividends | Synthetix per-token accumulator, pull-based | [DIVIDEND-MATH.md](./DIVIDEND-MATH.md) |
| Ownership | Ownable2Step, `renounceOwnership` disabled | OpenZeppelin v5 |
| Treasury | 2-day timelock: propose → wait → execute | `proposeTreasuryChange()` / `executeTreasuryChange()` |
| Flashloan guard | Per-user `lastTransferBlock` check | Cannot receive + act in same block |
| Activity proof | `_update()` hook checks `msg.sender == from` | Only direct transfers reset timer (M-01 fix) |
| MEV protection | Commit-reveal for fresh ABANDONED (< 24h) | `commitRecycle()` → 2 block delay → `recycleInactiveNode()` |
| Custom errors | 35 custom Solidity errors (no require strings) | Gas-optimized reverts |

---

## 3. Scope

### In Scope

| File | SLOC | Description |
|------|------|-------------|
| `contracts/WillChain.sol` | ~500 | Core protocol: ERC-20 + Dead Man's Switch + Dividends + MEV Protection |

### Out of Scope

| Component | Reason |
|-----------|--------|
| Frontend (`frontend-react/`) | UI convenience layer, no on-chain authority |
| Bot (`bot/`) | Notification service only, no on-chain privileges |
| Deployment scripts (`scripts/`) | One-time deploy, not audit-critical |
| OpenZeppelin imports | Assumed audited (ERC20, Ownable2Step, ReentrancyGuard) |

---

## 4. Document Map

Start with the **Audit Guide** for a 5-minute orientation, then use this map to go deeper.

| Document | Content | Priority |
|----------|---------|----------|
| [AUDIT-GUIDE.md](./AUDIT-GUIDE.md) | Quick-start: state machine, 5 key invariants, critical functions, trade-offs | **Start here** |
| [PROTOCOL-SPEC.md](./PROTOCOL-SPEC.md) | Canonical protocol behavior for all 5 vault states | High |
| [PROTOCOL-TRUTH.md](./PROTOCOL-TRUTH.md) | Semantic source of truth — resolves ambiguities between code and docs | High |
| [INVARIANTS.md](./INVARIANTS.md) | 20 formal invariants (economic, registration, timer, successor, MEV, admin, cross-layer) with test references | High |
| [THREAT-MODEL.md](./THREAT-MODEL.md) | 8 threat actors, attack surfaces, mitigations, 10 risk assessments | High |
| [ASSUMPTIONS-AND-GUARANTEES.md](./ASSUMPTIONS-AND-GUARANTEES.md) | 14 guarantees (G1–G14) the protocol provides + 10 non-guarantees (N1–N10) | High |
| [ACCEPTED-TRADEOFFS.md](./ACCEPTED-TRADEOFFS.md) | 7 intentional trade-offs (T1–T7) + 5 explicitly unprotected areas (U1–U5) | Medium |
| [SECURITY-AUDIT-REPORT.md](./SECURITY-AUDIT-REPORT.md) | Internal AI-assisted audit: methodology, all findings, resolutions | Medium |
| [SECURITY-MODEL.md](./SECURITY-MODEL.md) | User-facing security model explanation | Low |
| [DIVIDEND-MATH.md](./DIVIDEND-MATH.md) | Dividend accumulator math (Synthetix pattern), rounding analysis | Medium |
| [SLITHER-ACCEPTED.md](./SLITHER-ACCEPTED.md) | Slither static analysis: accepted findings with rationale | Medium |
| [GENERATED-REFERENCE.md](./GENERATED-REFERENCE.md) | Auto-generated ABI reference (CI-enforced sync with contract) | Reference |

---

## 5. Prior Audit Findings

### Internal Audit (Claude Opus 4.6 — 2026-03-09)

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | 1 Fixed, 1 Mitigated |
| Low | 5 | 3 Mitigated, 2 Acknowledged |
| Informational | 7 | Acknowledged |

**Key findings:**

| ID | Title | Resolution |
|----|-------|------------|
| M-01 | Allowance-based transfers reset activity timer | **Fixed** — `_update()` checks `msg.sender == from`; only direct transfers reset timer |
| M-02 | Dividend rounding dust accumulation | **Mitigated** — `recoverDividendDust()` capped at 0.1% of totalSupply per call |
| L-01 | No upper bound on `inactivityPeriod` | **Mitigated** — capped at 365 days |
| L-02 | `recoverDividendDust` callable by anyone | **Acknowledged** — by design, 0.1% cap limits abuse |
| L-03 | No event for `cancelSuccessorClaim` | **Fixed** — event added |
| L-04 | `renounceOwnership` not disabled | **Fixed** — overridden to revert |
| L-05 | Treasury change has no event | **Fixed** — events added for propose/execute/cancel |

Full details: [SECURITY-AUDIT-REPORT.md](./SECURITY-AUDIT-REPORT.md)

### Cross-Audit (GPT-4o — 2026-03-07)

Independent review produced no Critical or High findings beyond those already identified and resolved.

### Static Analysis (Slither — CI)

- 0 High severity findings
- 3 Medium findings accepted with documented rationale: [SLITHER-ACCEPTED.md](./SLITHER-ACCEPTED.md)

---

## 6. Test Coverage

### Test Suites

| Suite | Framework | Count | Status |
|-------|-----------|-------|--------|
| Contract unit + integration | Hardhat (Mocha/Chai) | 299 | All passing |
| Contract fuzz + invariants | Foundry | 10 × 10,000 runs | All passing |
| Bot API + logic | Node.js test runner | 124 | All passing |
| Frontend components | Vitest | 44 | All passing |
| Shared utilities | Node.js test runner | 197 | All passing |
| E2E smoke | Playwright | 28 | All passing |
| **Total** | | **702** | **All green** |

### Coverage (Hardhat — contract only)

| Metric | Coverage |
|--------|----------|
| Statements | 93.9% |
| Branches | 87.5% |
| Functions | 100% |
| Lines | 94.2% |

### Foundry Fuzz Invariants

| Test | Description | Runs |
|------|-------------|------|
| `testFuzz_supplyConservationAfterRecycle` | totalSupply decreases by exactly burned amount | 10,000 |
| `testFuzz_dividendPoolNeverExceedsContractBalance` | dividendPool ≤ balanceOf(contract) | 10,000 |
| `testFuzz_dividendSolvencyAfterRecycle` | sum(pending) ≤ contract balance | 10,000 |
| `testFuzz_everRegisteredConsistencyAfterRecycle` | everRegistered resets on recycle | 10,000 |
| `testFuzz_recycleOnlyAbandonedNodes` | recycle reverts for non-ABANDONED | 10,000 |
| `testFuzz_flashloanGuardPreventsInstantRecycle` | same-block receive + recycle blocked | 10,000 |
| `testFuzz_supplyOnlyDecreases` | totalSupply monotonically decreasing | 10,000 |
| `testFuzz_dividendPoolAlwaysSolvent` | dividend pool solvency after claim | 10,000 |
| `testFuzz_totalUnregisteredSupplyEqualsSum` | unregistered supply tracking correctness | 10,000 |
| `testFuzz_reentrancyBlocked` | ReentrancyGuard on all write paths | 10,000 |

---

## 7. CI Pipeline

| Job | Tool | What It Checks |
|-----|------|----------------|
| Contract tests | Hardhat | 299 unit/integration tests |
| Foundry fuzz | Forge | 10 fuzz tests × 10,000 runs |
| Frontend lint + build | ESLint + Vite | 0 lint errors, build under budget |
| Frontend tests | Vitest | 44 component tests |
| Bot tests | Node.js | 124 API + logic tests |
| Shared tests | Node.js | 197 utility tests |
| E2E smoke | Playwright | 28 browser tests |
| Static analysis | Slither | 0 High severity |
| Config drift | Custom script | Contract address/ABI consistency across all layers |
| Bundle budget | Vite | Per-chunk size limit (400 kB) |
| TypeScript | `tsc -b` | 0 errors across all packages |

---

## 8. Known Risks & Accepted Trade-offs

These are intentional design decisions, not bugs. Full details: [ACCEPTED-TRADEOFFS.md](./ACCEPTED-TRADEOFFS.md)

| Trade-off | Rationale |
|-----------|-----------|
| **Only direct transfers reset timer (T1)** | Prevents allowance-based timer manipulation (M-01). Smart wallets (Safe, ERC-4337) work correctly since `msg.sender == from`. DEX users must call `confirmActivity()` separately. |
| **Pull-based dividends (T2)** | O(1) gas per distribution. Unclaimed dividends accumulate and are recoverable via `recoverDividendDust()` with 0.1% cap. |
| **Single EOA owner (T3)** | Acceptable for testnet. Multisig (Gnosis Safe) required before mainnet. Ownable2Step mitigates accidental transfer. |
| **No formal verification (T4)** | Mitigated by 702 tests + 10 fuzz invariants × 10,000 runs. Formal verification (Certora) recommended for mainnet. |
| **Commit-reveal only for fresh ABANDONED (T5)** | Nodes ABANDONED > 24h use direct call — no informational advantage remains after 24h public visibility. |

---

## 9. Areas We Want Reviewed

We specifically request deeper review of these areas:

### 9.1 Dividend Accumulator Math

- `dividendPerToken` precision: uses `1e18` scaling factor
- Rounding behavior in `pendingDividends()` — can dust accumulate faster than `recoverDividendDust()` removes it?
- Edge case: what happens when `eligibleSupply` approaches zero?
- Reference: [DIVIDEND-MATH.md](./DIVIDEND-MATH.md)

### 9.2 State Transition Edge Cases

- Can a user get permanently stuck in any state?
- Is there a path to claim a vault that bypasses the 30-day veto window?
- Race condition: `completeVaultTransfer()` and `recycleInactiveNode()` for the same node
- `successorClaimInitiated` flag reset correctness across all paths

### 9.3 `_update()` Hook Correctness

- Called on every ERC-20 transfer (including mint/burn)
- Must correctly identify `msg.sender == from` for timer reset
- Must correctly track `totalUnregisteredSupply` for dividend eligibility
- Must not break standard ERC-20 behavior

### 9.4 Flashloan Resistance

- `lastTransferBlock[addr]` guard: is it sufficient against multi-block strategies?
- Can an attacker accumulate tokens across multiple blocks to game dividends?
- Reference: [THREAT-MODEL.md § 2.2](./THREAT-MODEL.md)

### 9.5 MEV Protection (Commit-Reveal)

- `commitRecycle()` → 2-block delay → `recycleInactiveNode()` for fresh ABANDONED
- Can a block builder see the commit and front-run the reveal?
- Is 2-block minimum delay sufficient?
- Reference: [THREAT-MODEL.md § 2.1](./THREAT-MODEL.md)

### 9.6 Economic Invariants

- All 20 invariants listed in [INVARIANTS.md](./INVARIANTS.md) — can any be violated?
- Particularly: INV-E1 (dividend pool solvency), INV-E3 (supply conservation), INV-E4 (recycle distribution completeness)

---

## 10. Deployment Info

| Parameter | Value |
|-----------|-------|
| **Current deployment** | Base Sepolia (testnet) |
| **Contract address** | `0x6fAd1475B41731E3eDA21998417Cb2e18E795877` |
| **Block explorer** | [BaseScan Sepolia](https://sepolia.basescan.org/address/0x6fAd1475B41731E3eDA21998417Cb2e18E795877) |
| **Mainnet target** | Base (Chain ID: 8453) |
| **Deploy script** | `scripts/deploy.js` |
| **Initial supply** | Fixed at deploy time (no minting function) |
| **Owner** | Single EOA (testnet) → Gnosis Safe multisig (mainnet) |
| **EIP-712 domain** | `{ name: 'WillChain', version: '1', chainId: 84532 }` |

### Config Files

| File | Purpose |
|------|---------|
| `shared/contract-config.js` | Canonical network + address config (bot, scripts) |
| `frontend-react/src/config/contract.ts` | Frontend ABI + contract constants |
| `hardhat.config.js` | Compiler settings, network config |

---

## 11. Contact & Disclosure

- **Security contact:** security@willchain.net
- **Vulnerability disclosure policy:** [SECURITY.md](../SECURITY.md)
- **Preferred disclosure:** Responsible disclosure via email
- **Response time:** 48 hours for initial acknowledgment
- **Bug bounty:** Planned (Immunefi) — not yet active

---

## 12. How to Run Tests

```bash
# Contract tests (Hardhat)
npx hardhat test                    # 299 tests

# Contract fuzz (Foundry)
forge test --match-path test/foundry/ -vv  # 10 invariant tests

# Bot tests
cd bot && npm test                  # 124 tests

# Frontend
cd frontend-react && npm run build  # TypeScript + Vite build
cd frontend-react && npx vitest run # 44 component tests

# Full QA gate (runs everything)
npm run qa                          # 10/10 checks
```

---

*Prepared for external audit engagement — 2026-03-10*
