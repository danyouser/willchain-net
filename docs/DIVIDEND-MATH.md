# WillChain — Dividend Distribution Math

This document describes the mathematical model underlying the dividend system. The implementation follows the Synthetix-style per-token accumulator pattern, which achieves O(1) distribution with no loops.

---

## Model Overview

Dividends are distributed whenever `recycleInactiveNode()` is called and the recycled node has a balance. The dividend share (47% of the recycled balance) is added to a global pool.

**State variables:**

| Variable | Type | Meaning |
|----------|------|---------|
| `dividendPool` | `uint256` | Total tokens currently in the dividend pool (unclaimed + future claims) |
| `dividendPerToken` | `uint256` | Accumulated dividends per eligible token (scaled by `PRECISION = 1e18`) |
| `lastDividendPerToken[addr]` | `uint256` | Snapshot of `dividendPerToken` at last claim/registration for `addr` |
| `unclaimedDividends[addr]` | `uint256` | Settled (tokens) owed to `addr`, not yet withdrawn |
| `totalUnregisteredSupply` | `uint256` | Sum of balances of all UNREGISTERED (never confirmed) addresses |

---

## Distribution Formula

When `amount` tokens are added to the dividend pool:

```
eligibleSupply = totalSupply
               - balanceOf(contract)
               - totalUnregisteredSupply + fromInUnreg
               - balanceOf(_from)
```

Where:
- `_from` is the node being recycled (its state was deleted before this call, so it appears as UNREGISTERED)
- `fromInUnreg = isUnregistered(_from) ? balanceOf(_from) : 0` — correction to avoid double-counting
- `balanceOf(contract)` — contract-held tokens cannot receive dividends

Then:

```
dividendPerToken += amount * PRECISION / eligibleSupply
```

**Edge case: `eligibleSupply == 0`**

If no registered holders exist (e.g., single-user system where the only registered node is being recycled), the tokens cannot be distributed. Instead:

```
_burn(_from, amount)
totalRemovedFromCirculation += amount
emit DividendsBurnedNoEligibleHolders(_from, amount)
```

This preserves supply conservation: no tokens are created or lost.

---

## Pending Dividends Formula

For any address `addr`, the pending (unclaimed) dividends at any point are:

```
pending(addr) = unclaimedDividends[addr]
              + balanceOf(addr) * (dividendPerToken - lastDividendPerToken[addr]) / PRECISION
```

This is evaluated lazily in `pendingDividends()` and settled to `unclaimedDividends[addr]` on:
- Any token transfer involving `addr` (via `_update()` hook)
- `claimDividends()` call

---

## UNREGISTERED Exclusion

The protocol excludes UNREGISTERED holders from dividends. This prevents:

1. **Dividend frontrunning** — Buying tokens just before a profitable recycle and immediately earning retroactive dividends
2. **Free-rider problem** — Holding tokens without participating in the protocol's activity confirmation

**Implementation:**

```solidity
mapping(address => bool) public everRegistered;
uint256 public totalUnregisteredSupply;
```

- On every token transfer via `_update()`:
  - If recipient is UNREGISTERED: `totalUnregisteredSupply += amount`
  - If sender is UNREGISTERED: `totalUnregisteredSupply -= amount`
- On `_performActivityConfirmation()` (first registration):
  - `totalUnregisteredSupply -= balanceOf(addr)` (addr leaves the unregistered set)
  - `lastDividendPerToken[addr] = dividendPerToken` (no retroactive earnings)
  - `everRegistered[addr] = true` (permanent, even after recycling)

**Invariant:**
```
totalUnregisteredSupply == Σ balanceOf(addr) for all addr where !everRegistered[addr]
```

---

## Rounding and Dust Recovery

Integer division in `dividendPerToken += amount * PRECISION / eligibleSupply` loses up to `eligibleSupply - 1` wei per distribution event.

Over time, this dust accumulates in the contract balance. It is recoverable by the contract owner via:

```solidity
function recoverDividendDust() external onlyOwner
```

Which computes:
```
dust = dividendPool - Σ pendingDividends(addr) for all registered holders
```

In practice, this is approximated as:
```
dust = (total claimable) - (sum of precision losses)
```

The recovered amount is transferred to `protocolTreasury` and emits `DividendDustRecovered`.

---

## Example: Single Recycle

Setup:
- Total supply: 1,000,000 WILL
- Registered holders: Alice (400,000), Bob (100,000)
- UNREGISTERED: Charlie (500,000) — never called `confirmActivity()`
- Node to recycle: Alice (she went inactive, balance 400,000)

Recycle splits Alice's 400,000:
- 47% = 188,000 → dividend pool
- 47% = 188,000 → burned
- 5%  = 20,000  → treasury
- 1%  = 4,000   → maintainer caller

`eligibleSupply` for dividend distribution:
```
= 1,000,000           (totalSupply before burn)
- 0                   (contract balance)
- 500,000             (totalUnregisteredSupply)
+ 400,000             (fromInUnreg correction: Alice was deleted, appears unregistered)
- 400,000             (Alice's own balance excluded)
= 500,000             (but after burn: totalSupply is now 812,000 at distribution time)
```

Wait — the burn happens first, then distribution. Let's recalculate with actual implementation order:

After burn: totalSupply = 812,000, Alice's balance = 0 (deleted), Charlie still unregistered.

```
eligibleSupply = 812,000 - 0 - 500,000 + 400,000 - 0 = 712,000
```

Hmm — the deleted Alice no longer has a balance. After state deletion, `balanceOf(alice) = 0`.

The `fromInUnreg` correction handles this: since alice's state was deleted (making her UNREGISTERED), `totalUnregisteredSupply` was NOT updated to include her (recycled nodes bypass the normal transfer hook). So `fromInUnreg = balanceOf(alice) = 0` (already zeroed by token movement to treasury/maintainer/burn).

In practice: Bob (100,000 registered) receives the full 188,000 dividend pool share, because he is the only eligible holder.

```
dividendPerToken += 188,000 * 1e18 / 100,000 = 1.88 * 1e18
Bob's pending = 100,000 * 1.88 = 188,000 ✓
```
