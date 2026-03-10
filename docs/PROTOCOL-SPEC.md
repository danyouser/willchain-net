# WillChain Protocol Specification

Single source of truth for protocol behavior.
All clients (frontend, bot, observer) must derive their logic from this document.

---

## Vault States (VaultStatus enum)

```
UNREGISTERED → ACTIVE ⇄ GRACE → CLAIMABLE → ABANDONED
                                    ↑
                          (successor initiated claim)
```

### 0 — UNREGISTERED

**Condition:** `lastActivityTimestamp == 0`
(address never called any registering action: `designateSuccessor()`, `setInactivityPeriod()`, `updateVaultData()`, or `confirmActivity()`)

**Meaning:**
- Address holds WILL tokens but has never "checked in"
- Does NOT earn dividends (excluded from dividend pool)
- Cannot have a successor claim initiated against it
- Can transition to ACTIVE by calling any registering function

**Key detail:** `everRegistered[addr]` stays `false` until first registration.
After a node is recycled, `everRegistered` is reset to `false` — the recycled address returns to UNREGISTERED.

---

### 1 — ACTIVE

**Condition:** `lastActivityTimestamp > 0` AND `block.timestamp < lastActivityTimestamp + inactivityPeriod`

**Meaning:**
- Node is fully active and earning dividends
- Successor cannot initiate a claim
- Any **direct** token transfer (`msg.sender == from`) from this address resets `lastActivityTimestamp` automatically
- `transferFrom` by a third-party spender does NOT reset the timer

---

### 2 — GRACE

**Condition:** `lastActivityTimestamp > 0`
AND `block.timestamp >= lastActivityTimestamp + inactivityPeriod`
AND `block.timestamp < lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD (30 days)`

**Meaning:**
- Inactivity period has elapsed; grace window has started
- Node owner can still "come back alive" by calling `confirmActivity()`
- Successor can initiate a claim during this window
- Node is still earning dividends

---

### 3 — CLAIMABLE

**Two paths to CLAIMABLE:**

**Path A — successor initiated claim (during GRACE):**
`successorClaimInitiated == true` AND `block.timestamp > claimInitiationTimestamp + GRACE_PERIOD`
AND `block.timestamp <= claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD`

**Path B — natural timeout (no claim initiated):**
`block.timestamp > lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD`
AND `block.timestamp <= lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD`

**Meaning:**
- Path A: Successor called `initiateSuccessorClaim()` during GRACE; veto window expired; successor can complete transfer
- Path B: No claim was initiated; vault drifted past the GRACE window; anyone can see it as CLAIMABLE but successor must still call `initiateSuccessorClaim()` first (if not yet ABANDONED)
- Node owner can still call `confirmActivity()` to reclaim the vault in either path
- Node is still earning dividends

**Important:** `initiateSuccessorClaim()` is blocked once the node reaches ABANDONED
(upper bound: `lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD`).

---

### 4 — ABANDONED

**Condition:** `lastActivityTimestamp > 0`
AND `block.timestamp >= lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD`
(when no claim initiated)
OR `successorClaimInitiated == true AND block.timestamp >= claimInitiationTimestamp + GRACE_PERIOD + CLAIM_PERIOD`

**Meaning:**
- No one acted in time; vault is now recyclable by anyone
- ABANDONED is NOT a final state — it's a trigger condition for recycling

**MEV Protection (Commit-Reveal):**
- **First 24 hours** after entering ABANDONED: recycling requires 2-step commit-reveal
  1. `commitRecycle(hash)` — hash = `keccak256(abandonedNode, salt, msg.sender)`
  2. Wait 2-256 blocks
  3. `executeRecycle(abandonedNode, salt)` — verify and execute
- **After 24 hours:** `recycleInactiveNode(addr)` can be called directly by any address

**On recycling:**
- 47% of balance → burned (`totalRemovedFromCirculation`)
- 47% → dividend pool (distributed to registered holders)
- 5%  → protocol treasury
- 1%  → caller (maintainer reward)
- Remaining dust (if any) → burned
- `nodeStates[addr]` deleted; `everRegistered[addr]` reset to `false`

---

## What Counts as Activity

Any of the following resets `lastActivityTimestamp` and transitions node to ACTIVE:

| Action | How |
|--------|-----|
| `confirmActivity()` | Explicit check-in |
| `designateSuccessor(addr)` | Also calls `_performActivityConfirmation` |
| `setInactivityPeriod(n)` | Also calls `_performActivityConfirmation` |
| `updateVaultData(hash)` | Also calls `_performActivityConfirmation` |
| `cancelSuccessorClaim()` | Also calls `_performActivityConfirmation` |
| ERC-20 `transfer()` (direct, `msg.sender == from`) | `_update()` hook auto-confirms for registered senders |
| ERC-20 `burn()` (`msg.sender == from`) | `_update()` hook auto-confirms for registered senders |
| Any other tx that calls the above | Transitively triggers registration |

**Not activity:**
- Receiving tokens (only sending triggers the hook)
- `transferFrom()` by a third-party spender (`msg.sender != from`) — does NOT reset the token owner's timer
- `claimDividends()` — does not reset timer
- Reading view functions

**First registration:** The first time `_performActivityConfirmation` is called for an address:
- Removes balance from `totalUnregisteredSupply`
- Sets `everRegistered[addr] = true`
- Snapshots `lastDividendPerToken` (no retroactive dividend earnings)

---

## When Successor Can Act

| Action | Precondition |
|--------|-------------|
| `initiateSuccessorClaim()` | Caller must be `designatedSuccessor`. Node must be in GRACE state AND before ABANDONED deadline. |
| `completeVaultTransfer()` | Caller must be `designatedSuccessor`. Node must be CLAIMABLE AND `CLAIM_PERIOD` elapsed. |
| `cancelSuccessorClaim()` | Can be called by the NODE OWNER (not successor) to veto. |

**The successor cannot claim a node that is already ABANDONED** — the upper bound
`lastActivityTimestamp + inactivityPeriod + GRACE_PERIOD + CLAIM_PERIOD` is enforced on-chain.

---

## Inactivity Periods

User configurable. Valid values only:

| Period | Inactivity | +Grace | +Claim | Total max until ABANDONED |
|--------|-----------|--------|--------|--------------------------|
| 30 days  | 30d | +30d | +30d | 90 days  |
| 90 days  | 90d | +30d | +30d | 150 days (default) |
| 180 days | 180d | +30d | +30d | 240 days |
| 365 days | 365d | +30d | +30d | 425 days |

---

## Service Tiers

Informational only — no on-chain enforcement.

| Tier | WILL balance |
|------|-------------|
| Basic | ≥ 1,000 WILL |
| Family | ≥ 10,000 WILL |
| Legacy | ≥ 100,000 WILL |
| Standard | < 1,000 WILL |

---

## Dividends

Distributed using Synthetix-style per-token accumulator (O(1), no loops).

- **Who earns:** All registered holders (`everRegistered == true`) at time of distribution.
- **Who does NOT earn:** UNREGISTERED addresses (`everRegistered == false`).
- **Source:** 47% of every recycled node's balance.
- **Claiming:** `claimDividends()` — pull pattern, no automatic distribution.
- **On zero eligible supply:** tokens are burned instead of distributed.

See `docs/DIVIDEND-MATH.md` for the accumulator formula.

---

## Accepted Tradeoffs

### 1. `transferFrom` does NOT reset the token owner's timer
The `_update()` hook only resets the activity timer when `msg.sender == from` (i.e., the token owner is the direct caller). This means:

- `transfer()` (owner sends directly) — resets timer (owner is provably alive)
- `transferFrom()` by a third-party spender — does NOT reset timer (spender cannot keep vault alive)
- `burn()` — resets timer (`msg.sender == from`, owner is provably alive)

**Consequence for DEX users:** If you interact with a DEX via `approve` + `transferFrom`, the swap does NOT reset your activity timer. You must call `confirmActivity()` separately to prove you are alive.

**Smart Wallets (Safe, ERC-4337):** These call `transfer()` directly (the wallet contract is `msg.sender` and also the `from` address), so they reset the timer correctly.

### 2. No re-minting after recycling
Once tokens are burned or distributed, they cannot be recovered. `totalRemovedFromCirculation` tracks permanently burned supply.

### 3. Flashloan protection is per-user, not global
`lastTransferBlock[address]` prevents same-block flashloan attacks (borrow → recycle/claim → repay).
Only protects against atomic same-block abuse, not multi-block strategies.

### 4. `vaultDataHash` is not validated on-chain
The `bytes32` stored via `updateVaultData()` is assumed to be an IPFS CID or similar reference.
Authenticity and availability of the off-chain data is the user's responsibility.

### 5. Treasury change requires 2-day timelock
`proposeTreasuryChange()` → wait 2 days → `executeTreasuryChange()`.
This gives token holders time to react to treasury changes.
The timelock cannot be bypassed by the owner.
