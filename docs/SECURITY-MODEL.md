# WillChain Security Model

This document explains how the protocol works from a user security perspective.
Read this before using WillChain with real assets.

---

## What counts as "activity"?

Your vault timer resets when you make an **outgoing transfer** from your registered wallet.
This includes:

| Action | Resets timer? |
|--------|--------------|
| Calling `confirmActivity()` directly | ✅ Yes |
| Sending WILL tokens via `transfer()` (you call it directly) | ✅ Yes |
| Burning WILL tokens via `burn()` | ✅ Yes |
| A DEX/protocol spending your tokens via `transferFrom` | ❌ No |
| Receiving tokens from someone | ❌ No |
| Claiming dividends (transfers from contract to you) | ❌ No |
| Smart Wallet (Safe, ERC-4337) sending via `transfer()` | ✅ Yes |

**Key rule:** Only **direct** outgoing transfers where `msg.sender == from` (i.e., you are the caller) from a *registered* wallet reset the timer.
`transferFrom` by a third party (DEX, DeFi protocol) does NOT reset your timer — even if you granted the allowance.
If you use a DEX, call `confirmActivity()` separately to prove you are alive.

---

## What is UNREGISTERED?

When you first receive WILL tokens, your vault status is **UNREGISTERED**.

- Your inactivity timer has NOT started
- You do NOT earn dividends (this is by design — you haven't opted in)
- Your vault can NEVER be recycled (no timer means no timeout)

**To activate your vault (successor-first setup):**
1. Call `designateSuccessor(address)` — set who inherits your vault (auto-registers you)
2. Optionally call `setInactivityPeriod(seconds)` — customize your timeout (30–365 days, default: 90)

Any of `designateSuccessor()`, `setInactivityPeriod()`, `updateVaultData()`, or `confirmActivity()` will auto-register an UNREGISTERED user via `_performActivityConfirmation()`. The recommended path is successor-first: just designate your heir and everything else activates automatically.

---

## Allowance and DEX usage

If you grant an allowance (approve) to a DEX, protocol, or any address:
- That spender can call `transferFrom` on your tokens **only while your vault is ACTIVE**
- This does **NOT** reset your inactivity timer (the contract checks `msg.sender == from`)
- A third party with an allowance **cannot** keep your vault alive on your behalf
- Once your vault enters GRACE, CLAIMABLE, or ABANDONED, all delegated spending (`transferFrom`/`burnFrom` by third parties) is **blocked** — the contract reverts with `DelegatedSpendingBlocked()`
- This protects your inheritance guarantee: inactive vault balances can only go to the designated successor or be recycled by the protocol

**Important for DEX users:** If your only on-chain activity is trading via DEX allowances (`approve` + `transferFrom`), your activity timer will NOT be reset. You must call `confirmActivity()` periodically to prove you are alive.

**Smart Wallets (Safe, ERC-4337)** are not affected by this — they call `transfer()` directly, where `msg.sender == from`, so the timer resets correctly.

---

## Smart Wallet support

WillChain fully supports Smart Wallets (Gnosis Safe, ERC-4337 Account Abstraction).

- Transactions sent through your Safe count as your activity
- The contract does NOT check `tx.origin`, only `msg.sender` (the from address in ERC20 transfers)
- An informational banner is shown in the UI if a smart wallet is detected

---

## Vault status lifecycle

```
UNREGISTERED → [designateSuccessor() or any setup action] → ACTIVE
                                              ↓ (inactivity period passes)
                                           GRACE (successor can initiate claim)
                                              ↓ (+ 30 days)
                                           CLAIMABLE (veto period passed)
                                              ↓ (+ 30 days)
                                           ABANDONED (anyone can recycle)
```

| Status | What it means | Who can act |
|--------|--------------|-------------|
| UNREGISTERED | Never registered | Owner: call designateSuccessor() (recommended) or any setup action |
| ACTIVE | Within inactivity period | Owner: any outgoing tx resets timer |
| GRACE | Past inactivity, successor can claim | Successor: initiateSuccessorClaim(); Owner: can veto |
| CLAIMABLE | Claim initiated + veto expired (Path A), OR natural timeout past GRACE with no claim (Path B) | Successor: completeVaultTransfer() (Path A) or initiateSuccessorClaim() first (Path B) |
| ABANDONED | Total timeout expired | Anyone: recycleInactiveNode() |

**Total timeout = inactivity period + 30 days (veto) + 30 days (claim)**

Example with 365-day period: 365 + 30 + 30 = **425 days** before recycling.

---

## Successor claiming

Your designated successor can act only after your inactivity period expires:

1. **initiateSuccessorClaim()** — starts the 30-day veto window
   - You (owner) receive an alert and can cancel by calling `cancelSuccessorClaim()`
   - Cancelling proves you're alive and resets your timer
2. **completeVaultTransfer()** — executable after 30-day veto, before ABANDONED
   - Transfers your entire WILL balance to the successor
   - Original vault state is cleared

If your vault reaches ABANDONED before the successor claims:
- The successor **cannot** initiate a claim anymore
- Anyone can call `recycleInactiveNode()` — tokens are distributed (burn/dividends/fees)
- Successor loses their inheritance window

---

## Dividend system

- Dividends come from recycled abandoned nodes (47% of recycled tokens)
- Only **registered** (everRegistered = true) users earn dividends
- UNREGISTERED users do not accumulate dividends — even if they hold tokens
- When you first register (via any setup action like `designateSuccessor()`), your dividend counter starts from that moment — no retroactive earnings
- Dividends are claimed via `claimDividends()` (pull pattern — you choose when)

---

## The bot is a helper, not a guarantee

The Telegram bot sends alerts but is NOT a source of truth:

- Bot alerts depend on RPC connectivity and cron schedules
- The **contract state is the only source of truth**
- Do not rely solely on bot alerts — periodically check your status directly on the dApp
- If you don't receive alerts, it does not mean your vault is safe
- Bot alert delay for grace period: up to 24 hours (daily cron at 09:00 UTC)

---

## Admin security (treasury and ownership)

The protocol owner can:
- Change the protocol treasury address (5% fee destination) via **2-day timelock**:
  1. `proposeTreasuryChange(newAddress)` — starts the clock
  2. After 48 hours: `executeTreasuryChange()` — applies the change
  - This delay allows users to observe and react to any unexpected governance change
- Transfer ownership via **Ownable2Step**: the new owner must explicitly call `acceptOwnership()`
  — a mistyped address cannot accidentally take over the protocol

The owner can also:
- Recover dividend dust via `recoverDividendDust()` — **no timelock**, but capped at **0.1% of totalSupply per call**
  - This recovers rounding remainders that accumulate in the dividend pool over time
  - The cap prevents extraction of meaningful amounts — an attacker controlling the owner key
    would need ~1,000 calls to drain 100% (each call limited to 0.1%)
  - Dust is sent to the protocol treasury address
  - Protected by `nonReentrant` and `onlyOwner`

The owner **cannot**:
- Change recycling distribution ratios
- Pause or freeze the contract
- Access other users' tokens or vault data
- Call `recoverDividendDust()` beyond the 0.1% cap per call

---

## Before mainnet: external audit

This contract has undergone multiple internal review rounds (52+ fixes documented in
[CLAUDE-CONTEXT.md](CLAUDE-CONTEXT.md)). Before depositing significant value, wait for a
professional third-party audit. Follow the project's announcement channels for audit reports.

See [docs/AUDIT-GUIDE.md](AUDIT-GUIDE.md) for the auditor's guide.
