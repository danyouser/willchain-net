# WillChain Threat Model v1

This document identifies threat actors, attack surfaces, and mitigations
for the WillChain protocol. It covers on-chain, off-chain, and operational risks.

---

## 1. Threat Actors

| Actor | Capability | Motivation |
|-------|-----------|------------|
| **MEV Searcher** | Monitor mempool, front-run/sandwich txs | Steal recycling rewards (1%) |
| **Malicious Successor** | Designated as successor by vault owner | Claim vault before owner can respond |
| **Rogue Admin (Owner Key)** | Call onlyOwner functions | Extract value, change treasury, grief users |
| **Flashloan Attacker** | Borrow large amounts in one tx | Manipulate dividend distribution, inflate balance for recycling |
| **Griefing Actor** | No special access | Waste gas, spam, DOS attack surfaces |
| **Phishing Attacker** | Social engineering | Trick users into signing malicious transactions |
| **Compromised Bot Operator** | Access to bot server, Telegram token, RPC keys | Send false alerts, miss real alerts, extract user data |
| **Smart Contract Bug** | Exploit unintended code paths | Drain funds, lock funds, bypass timers |

---

## 2. Attack Surfaces & Mitigations

### 2.1 On-Chain — MEV / Front-Running

**Target:** `recycleInactiveNode()` — 1% caller reward

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Front-run recycle tx to steal reward | Commit-reveal scheme for fresh ABANDONED (<24h) | Implemented |
| Sandwich attack on recycle | Commit-reveal eliminates sandwich for fresh nodes; stale nodes have no urgency advantage | Implemented |
| Block builder collusion | COMMIT_MIN_DELAY=2 blocks ensures commit is mined before reveal is possible | Implemented |

**Residual risk:** Stale ABANDONED (>24h) uses direct call — but by then the node has been visible for 24h, no informational advantage remains.

### 2.2 On-Chain — Flashloan Attacks

**Target:** Dividend distribution, vault transfer

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Flashloan to inflate balance → claim larger dividends | `lastTransferBlock[addr] < block.number` guard on `claimDividends()` | Implemented |
| Flashloan to register + recycle in same block | `lastTransferBlock` guard on `recycleInactiveNode()` and `completeVaultTransfer()` | Implemented |
| Flashloan to manipulate totalUnregisteredSupply | Registration requires explicit `confirmActivity()` — mere token receipt doesn't register | By design |

### 2.3 On-Chain — Timer Manipulation

**Target:** Inactivity timer, vault status transitions

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Third-party keeps vault alive via `transferFrom` allowances | Only direct transfers (`msg.sender == from`) reset timer (M-01 fix) | Implemented |
| Owner extends timer indefinitely to avoid legitimate successor claim | Timer resets are owner actions — this is by design (vault owner controls their vault) | By design |
| Successor initiates claim on ABANDONED vault | `initiateSuccessorClaim()` blocked when vault is ABANDONED | Implemented |
| Reduced inactivity period to rush through GRACE | `setInactivityPeriod()` resets timer — new period starts from NOW | Implemented |

### 2.4 On-Chain — Successor Attacks

**Target:** Vault transfer, claim initiation

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Circular successor deadlock (A→B→A) | `designateSuccessor()` checks for circular chain | Implemented |
| Self as successor | `designateSuccessor()` rejects `msg.sender` | Implemented |
| Contract as successor | `designateSuccessor()` rejects `address(this)` | Implemented |
| Successor completes transfer during veto window | 30-day veto window; `completeVaultTransfer()` blocked until veto expires | Implemented |
| Successor races owner's cancel | Owner can cancel anytime during GRACE+CLAIM; cancel resets timer | Implemented |
| Multiple successor claims in parallel | `successorClaimInitiated` flag prevents second initiation | Implemented |

### 2.5 On-Chain — Admin Abuse

**Target:** Protocol treasury, ownership

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Admin drains treasury instantly | 2-day timelock on treasury change (`proposeTreasuryChange` → `executeTreasuryChange`) | Implemented |
| Admin takes ownership of user vaults | Owner has NO access to user tokens or vault data | By design |
| Admin pauses contract to hold funds hostage | No pause/freeze mechanism exists | By design |
| Admin drains dividend dust rapidly | `recoverDividendDust()` capped at 0.1% of totalSupply per call | Implemented |
| Admin renounces ownership (bricking admin functions) | `renounceOwnership()` disabled (always reverts) | Implemented |
| Admin key compromise → ownership transfer | Ownable2Step: new owner must explicitly `acceptOwnership()` | Implemented |

### 2.6 On-Chain — Dividend System

**Target:** Dividend pool, pending dividends

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Free-rider: hold tokens without registering, claim dividends | UNREGISTERED users excluded from dividend calculations; `totalUnregisteredSupply` tracks their tokens | Implemented |
| Retroactive dividend claims after registration | `lastDividendPerToken` snapshot taken at registration time | Implemented |
| Dividend pool exceeds contract balance (insolvency) | Invariant tested: `dividendPool <= balanceOf(contract)` (Foundry fuzz) | Tested |
| Rounding dust accumulates and becomes extractable | Dust capped at 0.1% per `recoverDividendDust()` call | Implemented |

### 2.7 Off-Chain — Bot & Notification

**Target:** User alerting, bot availability

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Bot downtime → missed GRACE alerts | Bot is helper only, contract is source of truth; users should check dApp directly | Documented |
| RPC outage → stale data | `/health` endpoint with block lag detection (503 if >10 min lag) | Implemented |
| Rate limiting bypass → bot spam | SQLite-based persistent rate limits | Implemented |
| Fake bot sends phishing links | Users verify via official channels; bot deep-links to canonical frontend URL | Documented |
| EIP-712 replay attack (wallet linking) | Nonce-based challenges with 5-min TTL | Implemented |

### 2.8 Off-Chain — Frontend

**Target:** User transactions, UI integrity

| Threat | Mitigation | Status |
|--------|-----------|--------|
| User sends tx that will revert (wasted gas) | `useSimulatedWrite` fail-closed: button disabled if simulation fails | Implemented |
| Wrong chain → tx to wrong contract | `useChainGuard` validates correct chain before every write | Implemented |
| UI shows stale vault status | Auto-refresh polling every 30 seconds (`useNodeState`) | Implemented |
| XSS via vault data hash | Vault data is `bytes32` hash only — no user-generated HTML rendered | By design |
| Phishing site mimics frontend | Domain verification, Open Graph meta tags, official announcement channels | Partial |

---

## 3. Trust Assumptions

| Assumption | Impact if Violated |
|------------|-------------------|
| Base L2 sequencer is honest and available | Transactions delayed or censored; timer continues counting off-chain |
| Block timestamps are within ~15 seconds of real time | Timer-based transitions could be off by seconds (negligible for day-scale periods) |
| RPC provider returns correct chain state | Bot and frontend could show incorrect status; contract state remains correct |
| Owner key is not compromised | Attacker could change treasury (after 2-day delay) and drain dust (0.1% per call) |
| Users check their vault status periodically | Missing GRACE alerts from bot could lead to unintended recycling |
| Deployed bytecode matches audited source | A deployment from different source could contain backdoors |

---

## 4. Severity Assessment

| Risk ID | Description | Likelihood | Impact | Severity | Status |
|---------|------------|------------|--------|----------|--------|
| R-01 | MEV front-running on recycle reward | Medium | Low (1% reward) | Low | Mitigated |
| R-02 | Flashloan dividend manipulation | Low | Medium | Low | Mitigated |
| R-03 | Timer manipulation via transferFrom | Medium | High | High | Fixed (M-01) |
| R-04 | Admin key compromise | Low | Medium | Medium | Mitigated (timelock) |
| R-05 | Circular successor deadlock | Medium | Medium | Medium | Fixed |
| R-06 | Free-rider dividend theft | High | Medium | High | Fixed |
| R-07 | Bot downtime during GRACE | Medium | High | High | Documented (not fixable on-chain) |
| R-08 | UI shows stale data | Low | Medium | Low | Mitigated (30s polling) |
| R-09 | Successor claims on ABANDONED vault | Low | High | Medium | Fixed |
| R-10 | Reentrancy in recycle/claim | Low | Critical | Medium | Mitigated (nonReentrant + CEI) |

---

## 5. Out of Scope

These threats are acknowledged but NOT mitigated by the protocol:

- **L2 sequencer downtime** — Base L2 availability is outside protocol control
- **Token price manipulation** — WillChain is a utility token, not DeFi; no oracle dependency
- **Social engineering** — Users tricked into designating a malicious successor
- **Private key loss** — Standard wallet security, not protocol-specific
- **Regulatory risk** — Inheritance laws vary by jurisdiction

---

## 6. Recommendations for External Audit

Priority areas for auditors:

1. **Dividend math** — `_updateDividends()`, `pendingDividends()`, `dividendPerToken` calculations
2. **Timer boundaries** — Exact second-level behavior at GRACE↔CLAIMABLE↔ABANDONED transitions
3. **Reentrancy** — `_recycleInactiveNode()` internal call chain (burn, transfer, dividendPool update)
4. **Edge cases** — Zero-balance recycling, zero-holder dividend distribution, re-registration flows
5. **Commit-reveal** — Hash collision resistance, block delay bounds, stale commit handling

See [AUDIT-GUIDE.md](AUDIT-GUIDE.md) for the auditor's technical walkthrough.
