# WillChain — Audit Guide

This document is intended for security auditors, external reviewers, and contributors who need to quickly understand the protocol's threat model, invariants, and critical code paths.

---

## State Machine

Every registered node transitions through these states:

```
UNREGISTERED (0)
    │  confirmActivity() or direct token transfer (msg.sender == from)
    ▼
  ACTIVE (1) ◄──────────────────────────────────────────────┐
    │  time passes (> inactivityPeriod)                      │ cancelSuccessorClaim()
    ▼                                                         │ confirmActivity()
  GRACE (2)                                                   │ designateSuccessor()
    │  initiateSuccessorClaim()                               │ updateVaultData()
    ▼                                                         │ setInactivityPeriod()
  CLAIMABLE (3) ─────────────────────────────────────────────┘
    │  completeVaultTransfer() (after 30-day veto window)
    ▼
  [Vault transferred to successor — owner's node DELETED]

  GRACE (2) or CLAIMABLE (3)
    │  time passes (> inactivityPeriod + 30d grace + 30d claim)
    ▼
  ABANDONED (4)
    │  recycleInactiveNode()
    ▼
  [Node state DELETED — tokens redistributed — node is UNREGISTERED again]
```

**Key facts:**
- `getVaultStatus()` is a pure view computed from on-chain timestamps
- `ABANDONED` is terminal: `recycleInactiveNode()` deletes the node, reverting to UNREGISTERED
- A recycled address can re-register via `confirmActivity()`

---

## Contract Invariants

The following invariants must hold after every state-changing transaction:

1. **Supply conservation** — `totalSupply` only decreases via burns; tokens redistributed in `recycleInactiveNode()` sum exactly to the recycled balance (verified by tests in "Distribution Math").

2. **`totalUnregisteredSupply` consistency** —
   ```
   totalUnregisteredSupply == Σ balanceOf(addr) for all addr where !everRegistered[addr]
   ```
   Updated in `_update()` hook on every transfer; reset on `_performActivityConfirmation()`.

3. **`dividendPool` monotonicity** — `dividendPool` only increases (via `_addToDividendPool`) or decreases (via `claimDividends` and `recoverDividendDust`). It never goes negative; protected by `>=` checks.

4. **No retroactive dividends** — On registration, `lastDividendPerToken[addr]` is snapshotted to the current global `dividendPerToken`. A node can only earn dividends from recycles that occur *after* its registration.

5. **Treasury timelock** — `protocolTreasury` can only change via the 2-step `proposeTreasuryChange` → 2-day wait → `executeTreasuryChange` flow. Direct assignment was removed in v2.

---

## Known Trade-offs

1. **Only direct transfers reset the activity timer (M-01 fix)** — The `_update()` hook checks `msg.sender == from` before calling `_performActivityConfirmation()`. This means `transfer()` and `burn()` (where msg.sender is the token owner) reset the timer, but `transferFrom()` by a third-party spender does NOT. Smart Wallets (Safe, ERC-4337) call `transfer()` directly where `msg.sender == from`, so they work correctly. DEX users who interact via allowances must call `confirmActivity()` separately.

2. **No re-minting** — Burned tokens (47% of recycled balance) are permanently removed from circulation. There is no inflation mechanism. The total supply can only decrease over time.

3. **Dividends are pull-based** — Holders must call `claimDividends()` to receive their share. Unclaimed dividends accumulate in `unclaimedDividends[addr]` and are recoverable via `recoverDividendDust()` after extended inactivity.

---

## Critical Functions to Audit

| Function | Why Critical |
|----------|-------------|
| `recycleInactiveNode()` | Deletes node state and redistributes tokens. Must enforce ABANDONED status. Must correctly distribute 47/47/5/1 split. |
| `_addToDividendPool()` | Core dividend accumulator. `eligibleSupply` formula must correctly exclude unregistered holders and the recycled node itself. |
| `completeVaultTransfer()` | Transfers entire token balance to successor. Must enforce 30-day veto window and correct vault status. |
| `_performActivityConfirmation()` | Called on every "I'm alive" operation. Must correctly transition UNREGISTERED→ACTIVE by removing from `totalUnregisteredSupply`. |
| `executeTreasuryChange()` | Changes fee destination. Must enforce 2-day timelock. |

---

## Out of Scope

- **Frontend** — The React UI is a convenience wrapper. All security guarantees come from the contract.
- **Bot** — The Telegram bot is informational only and has no on-chain privileges.
- **Gas optimization** — Protocol correctness takes priority over gas savings.
- **ERC-20 standard edge cases** — The contract inherits from OpenZeppelin's `ERC20` and `Ownable`. Known OZ issues are not in scope.
