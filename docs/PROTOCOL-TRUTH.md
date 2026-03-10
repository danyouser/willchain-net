# WillChain — Protocol Truth

> **This is the single canonical reference for all WillChain behavior.**
> Every other document (WHITEPAPER, RUNBOOK, SECURITY-MODEL, frontend tooltips, bot messages, FAQ)
> must be consistent with this file. When in doubt, this file wins.
>
> Last verified against contract: `WillChain.sol` · Solidity 0.8.24 · Base Sepolia
> `0x6fAd1475B41731E3eDA21998417Cb2e18E795877`

---

## 1. Vault State Machine

```
UNREGISTERED ──setup action*──► ACTIVE ──inactivityPeriod elapsed──► GRACE
                                       ▲                                      │
                                       │ confirmActivity()                    │ confirmActivity()
                                       │                                      ▼
                                  CLAIMABLE ◄── veto expired ──── GRACE (claim initiated)
                                       │
                                       │ completeVaultTransfer() OR timeout
                                       ▼
                                  ABANDONED ──recycleInactiveNode()──► [deleted]
```

### State 0 — UNREGISTERED

**On-chain condition (canonical):**
```
lastActivityTimestamp == 0
```

**Invariants:**
- `everRegistered[addr] == false`
- Address does NOT earn dividends
- `getNodeState().isActive == false`
- `totalUnregisteredSupply` includes this address's balance
- Cannot have `initiateSuccessorClaim()` called against it

**Transition out:** Any call to `confirmActivity()`, `designateSuccessor()`,
`setInactivityPeriod()`, or `updateVaultData()`.
All invoke `_performActivityConfirmation()` which registers the node.

Note: `cancelSuccessorClaim()` also calls `_performActivityConfirmation()`, but an
UNREGISTERED node cannot have a pending successor claim, so this is not a practical path.

**NOT a transition:** Receiving tokens or making an outgoing ERC-20 transfer.
Direct transfers (`msg.sender == from`) only reset the timer for *already registered* users (`everRegistered == true`).
An UNREGISTERED sender's transfer does NOT auto-register them.
A `transferFrom` by a third-party spender does NOT reset anyone's timer (regardless of registration status).

**After recycling:** `everRegistered` is reset. The recycled address returns to UNREGISTERED
even if it held tokens before recycling.

---

### State 1 — ACTIVE

**On-chain condition (canonical):**
```
lastActivityTimestamp > 0
AND block.timestamp < lastActivityTimestamp + effectiveInactivityPeriod
```

where `effectiveInactivityPeriod = (inactivityPeriod == 0) ? DEFAULT_INACTIVITY_PERIOD : inactivityPeriod`
and `DEFAULT_INACTIVITY_PERIOD = 90 days`.

**Invariants:**
- `everRegistered[addr] == true`
- Earns dividends
- `getNodeState().isActive == true`
- Successor CANNOT initiate claim

**Dashboard WARNING sub-state:** `timeUntilInactive <= 7 days` — still ACTIVE on-chain,
but frontend shows a warning badge. This is a UI concern only; the contract has no WARNING state.

---

### State 2 — GRACE

**On-chain condition (canonical):**
```
lastActivityTimestamp > 0
AND block.timestamp >= lastActivityTimestamp + effectiveInactivityPeriod
AND block.timestamp <  lastActivityTimestamp + effectiveInactivityPeriod + GRACE_PERIOD
AND (successorClaimInitiated == false OR not yet in CLAIMABLE window)
```

where `GRACE_PERIOD = 30 days`.

**Invariants:**
- Owner can still `confirmActivity()` to return to ACTIVE
- Successor CAN call `initiateSuccessorClaim()` during this window
- `getNodeState().isActive == true`
- Earns dividends
- `initiateSuccessorClaim()` BLOCKED after `lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD`

---

### State 3 — CLAIMABLE

**Two distinct paths — both canonical:**

**Path A (claim-initiated):**
```
successorClaimInitiated == true
AND block.timestamp >  claimInitiationTimestamp + GRACE_PERIOD     (veto window elapsed)
AND block.timestamp <= claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD
```

**Path B (natural timeout — no claim initiated):**
```
successorClaimInitiated == false
AND block.timestamp >  lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD
AND block.timestamp <= lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD
```

where `CLAIM_PERIOD = 30 days`.

**Invariants:**
- Path A: `completeVaultTransfer()` callable by designated successor
- Path B: vault is CLAIMABLE on-chain, but successor must first call `initiateSuccessorClaim()`
  — which is only possible if the vault hasn't yet reached ABANDONED
- Owner can still `confirmActivity()` to reclaim vault
- Earns dividends

**Critical:** In Path B, if successor has not yet initiated a claim, they have a narrow window
to call `initiateSuccessorClaim()` before the vault reaches ABANDONED and that function becomes blocked.

---

### State 4 — ABANDONED

**On-chain condition (canonical):**
```
lastActivityTimestamp > 0
AND (
  (successorClaimInitiated == false
   AND block.timestamp >= lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD)
  OR
  (successorClaimInitiated == true
   AND block.timestamp >= claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD)
)
```

**Invariants:**
- `initiateSuccessorClaim()` is BLOCKED (upper bound enforced on-chain)
- `recycleInactiveNode(addr)` callable by ANY address
- Node is NOT earning dividends (balance will be distributed on recycling)
- `getNodeState().isActive == false` ← **NOTE:** this differs from contract's `isActive` field which may still show true; use `timeUntilAbandoned == 0` as the canonical check

**On recycling (distribution):**

| Recipient | BPS | % |
|-----------|-----|---|
| Burn (`totalRemovedFromCirculation`) | 4700 | 47% |
| Dividend pool (all registered holders) | 4700 | 47% |
| Protocol treasury | 500 | 5% |
| Caller (maintainer reward) | 100 | 1% |
| **Total** | **10000** | **100%** |

Dust remainder (rounding) → burned.
`nodeStates[addr]` deleted. `everRegistered[addr]` reset to `false`.

---

## 2. Activity Triggers

These reset `lastActivityTimestamp` and, for first-time callers, register the node:

| Function | Explicit or via `_performActivityConfirmation` |
|----------|-----------------------------------------------|
| `confirmActivity()` | Explicit |
| `designateSuccessor(addr)` | via `_performActivityConfirmation` |
| `setInactivityPeriod(n)` | via `_performActivityConfirmation` |
| `updateVaultData(hash)` | via `_performActivityConfirmation` |
| `cancelSuccessorClaim()` | via `_performActivityConfirmation` |
| ERC-20 direct outgoing transfer (`msg.sender == from`, registered sender) | via `_update()` hook |
| `burn()` (`msg.sender == from`, registered sender) | via `_update()` hook |

**Not activity:**
- Receiving tokens
- `transferFrom()` by a third-party spender (`msg.sender != from`) — does NOT reset the token owner's timer
- `claimDividends()`
- `approve()` / allowance management
- Any view/pure function call

---

## 3. Dividend Mechanics

Model: Synthetix-style per-token accumulator (O(1)).

```
lastDividendPerToken[addr]  — snapshot at registration time
dividendPerTokenStored      — global accumulator, increases on each recycling
pendingDividends[addr]      — claimable amount
```

**Who earns:** `everRegistered[addr] == true` at time of recycling.

**Who does NOT earn:**
- `everRegistered == false` (UNREGISTERED)
- Contract address itself
- Zero address

**Zero eligible supply:** If `eligibleSupply == 0` at recycling time, the 47% dividend share
is **burned** (not held). Event `DividendsBurnedNoEligibleHolders` is emitted.

**Claiming:** Pull pattern — `claimDividends()`. No automatic push.

**Dust recovery:** Owner can call `recoverDividendDust()` to sweep rounding dust to treasury.
Event `DividendDustRecovered` emitted.

**FrozenDividends:** On recycling, if `unclaimedDividends[abandonedNode] > 0`, those dividends
are returned to the pool. Event `FrozenDividendsRecovered` emitted.

---

## 4. Successor Flow (step-by-step)

```
1. Owner: designateSuccessor(successorAddr)        → sets designatedSuccessor, resets timer
2. Node enters GRACE (owner inactive)
3. Successor: initiateSuccessorClaim(ownerAddr)    → starts 30-day veto window
4. Owner: [optionally] confirmActivity()           → cancels the claim, returns to ACTIVE
4. Owner: [optionally] cancelSuccessorClaim()      → owner veto
5. After 30 days: CLAIMABLE (Path A)
6. Successor: completeVaultTransfer(ownerAddr)     → transfers all tokens to successor
                                                      deletes nodeStates[ownerAddr]
                                                      resets everRegistered[ownerAddr]
```

**completeVaultTransfer flashloan guard:**
`lastTransferBlock[msg.sender] < block.number` — prevents same-block attack.

---

## 5. Inactivity Periods

Valid values only (enforced on-chain):

| Label | Inactivity | Grace | Claim | Total until ABANDONED |
|-------|-----------|-------|-------|----------------------|
| 30 days  | 2,592,000s  | 2,592,000s | 2,592,000s | 90 days  |
| 90 days  | 7,776,000s  | 2,592,000s | 2,592,000s | 150 days (default) |
| 180 days | 15,552,000s | 2,592,000s | 2,592,000s | 240 days |
| 365 days | 31,536,000s | 2,592,000s | 2,592,000s | 425 days |

Constants in `frontend-react/src/config/contract.ts`:
```ts
export const GRACE_PERIOD_SECONDS = 30 * 24 * 60 * 60   // 2,592,000
export const CLAIM_PERIOD_SECONDS  = 30 * 24 * 60 * 60   // 2,592,000
```

---

## 6. Admin Operations

### Treasury Change (2-day timelock)
```
owner → proposeTreasuryChange(newAddr)    // emits TreasuryChangeProposed
        [wait 2 days]
owner → executeTreasuryChange()           // emits TreasuryUpdated
owner → cancelTreasuryChange()            // emits TreasuryChangeCancelled (anytime before execute)
```

**Overwriting a pending proposal** implicitly cancels it and emits `TreasuryChangeCancelled`.

### Ownership Transfer (Ownable2Step)
```
owner → transferOwnership(newOwner)       // emits OwnershipTransferStarted
newOwner → acceptOwnership()              // emits OwnershipTransferred
owner → transferOwnership(address(0))     // cancels pending transfer
```

`renounceOwnership()` is **disabled** — reverts with "Renounce disabled".

### Dividend Dust Recovery
```
owner → recoverDividendDust(destination)  // sweeps unclaimable rounding remainder
                                          // emits DividendDustRecovered
```

---

## 7. Security Invariants

These must hold at all times. Violation = critical bug.

| # | Invariant |
|---|-----------|
| S1 | `dividendPool >= Σ unclaimedDividends[all addresses]` |
| S2 | `totalSupply == totalRegisteredSupply + totalUnregisteredSupply + contractBalance` (approximately, excluding address(0)) |
| S3 | `totalRemovedFromCirculation` only increases, never decreases |
| S4 | `lastTransferBlock[addr]` is per-user — no global flashloan guard |
| S5 | ABANDONED nodes cannot have `initiateSuccessorClaim()` called |
| S6 | UNREGISTERED nodes cannot have `initiateSuccessorClaim()` called |
| S7 | `designatedSuccessor` cannot be `address(0)` or `address(this)` or the caller |
| S8 | Circular successor chains are blocked: if A→B, then B cannot designate A |
| S9 | `vaultDataHash` cannot be `bytes32(0)` |
| S10 | Treasury cannot be `address(0)` or `address(this)` |

---

## 8. Accepted Tradeoffs

### T1 — `transferFrom` does NOT reset the token owner's timer
The `_update()` hook only resets the timer when `msg.sender == from`. This means:
- `transfer()` (owner calls directly) — resets timer
- `transferFrom()` by third-party spender — does NOT reset timer
- `burn()` — resets timer (`msg.sender == from`)
- Smart Wallets (Safe, ERC-4337) call `transfer()` directly, so they reset the timer correctly
- DEX swaps via allowance do NOT reset the timer; users should call `confirmActivity()` separately

### T2 — No re-minting
Burned tokens (`totalRemovedFromCirculation`) are permanently gone.

### T3 — Flashloan protection is per-block, not per-tx
`lastTransferBlock[addr]` prevents atomic same-block abuse.
Multi-block strategies are not protected — considered out-of-scope.

### T4 — `vaultDataHash` is not validated on-chain
Off-chain data availability (IPFS) is user's responsibility.

### T5 — Bot and off-chain systems are trusted
On-chain state is authoritative. Bot alerts are best-effort, not guaranteed.

### T6 — Smart contract wallets supported (Ownable2Step + no tx.origin guard)
Safe, ERC-4337 wallets work correctly. `tx.origin` guard was explicitly removed.

---

## 9. Threat Model

**In-scope (contract protects against):**
- Flashloan attacks on claims/recycles (per-block guard)
- Unauthorized treasury changes (2-day timelock)
- UNREGISTERED free-rider dividends (totalUnregisteredSupply tracking)
- Circular successor chains (explicit check)
- Self-recycle (ABANDONED check)
- Self-successor (explicit check)
- Premature ownership transfer (Ownable2Step)
- Successor claiming ABANDONED vault (`initiateSuccessorClaim` upper bound)

**Out-of-scope (accepted risks):**
- ~~Malicious spender with approved allowance keeping vault alive~~ — **Fixed** (`_update()` checks `msg.sender == from`; `transferFrom` no longer resets timer)
- Off-chain data loss (T4)
- Bot downtime / missed alerts (T5)
- Front-running of `recycleInactiveNode` (by design — 1% reward is the incentive)
- Social engineering of successor (user responsibility)

---

## 10. Client Consistency Requirements

All clients (React frontend, Telegram bot, observer, scripts) MUST:

1. Use `shared/vault-status.js` (`deriveVaultStatus()`) for status classification — never inline logic
2. Display ABANDONED state using `timeUntilAbandoned == 0 AND lastActivityTimestamp > 0`
   — do NOT rely on `getNodeState().isActive` alone
3. Block `initiateSuccessorClaim()` calls when `getVaultStatus() == ABANDONED`
4. Block `recycleInactiveNode()` calls when `getVaultStatus() != ABANDONED`
5. Show the 30-day veto window countdown starting from `claimInitiationTimestamp`
6. Inform users that `transferFrom` (DEX swaps via allowance) does NOT reset the activity timer — they must call `confirmActivity()` separately

**Canonical status mapping for UI:**

| Contract Status | CSS class | i18n key | Bot message |
|----------------|-----------|----------|-------------|
| UNREGISTERED | `status-warning` | `dashboard.status_unregistered` | "Not registered" |
| ACTIVE (>7d) | `status-active` | `dashboard.status_active` | "Active" |
| ACTIVE (≤7d) | `status-warning` | `dashboard.status_warning` | "Active (expiring soon)" |
| GRACE/CLAIMABLE | `status-danger` | `dashboard.status_grace` | "Grace period / Claimable" |
| ABANDONED | `status-danger` | `dashboard.status_abandoned` | "Abandoned" |

---

## 11. Known Gaps (pre-mainnet)

| Gap | Risk | Mitigation |
|----|------|------------|
| No formal verification (Certora/Halmos) | Medium | 299 Hardhat + 197 shared + 44 React + 124 bot + 10 fuzz tests; 90% branch coverage |
| Bot rate limiting is ephemeral per-restart | Low | SQLite `rate_limits` table added |
| No Privacy Policy / ToS | Medium | Required before mainnet |
| No bug bounty program | Medium | Plan for post-audit launch |
| CEX black-hole problem (exchange wallets never "die") | Low | v2 staked/vaulted model planned |

---

*This document supersedes: `PROTOCOL-SPEC.md`, `SECURITY-MODEL.md` (for protocol facts),
`AUDIT-GUIDE.md` (for invariants). Those documents remain for context and audience-specific framing.*
