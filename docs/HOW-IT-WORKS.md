# WillChain: How It Works

## One-Page Explainer

---

## The Simple Version

WillChain is a **Dead Man's Switch** for your crypto with automatic **Proof of Activity**.

- **Use your wallet normally** → Direct transfers auto-confirm you're alive
- **Stay inactive too long** → Tokens get recycled
- **Set a successor** → They can claim if you're gone

That's it. No magic, no promises, no middlemen.

---

## Why I Can't Steal Your Money

### 1. I Never Have Access

The smart contract is deployed on Base blockchain. Once deployed:
- I can't modify it
- I can't pause it
- I can't access your funds
- I can't change the distribution rules

The code is open source. Anyone can verify it on [Basescan](https://basescan.org).

### 2. Only You Control Your Wallet

Your tokens live in YOUR wallet. Not mine. Not a "vault". Yours.

The contract only tracks:
- When you last checked in
- Who your successor is
- How long you've been inactive
- Your vault data hash (optional)

### 3. The Code Is The Law

```
UNREGISTERED:    Hold WILL but haven't set up your vault yet.
                 No timer. No dividends. Cannot be recycled.

ACTIVE:          Registered and within your inactivity period.
                 Direct transfers (msg.sender == from) reset your timer.

+GRACE (30d):    Inactivity period expired.
                 Successor can initiate a claim. You can cancel anytime.

+CLAIM (30d):    Claim initiated, veto window passed.
                 Successor can complete transfer.

ABANDONED:       Total timeout expired. Anyone triggers recycling:
                 - 47% burned forever
                 - 47% to dividend pool (registered active holders claim)
                 - 5% to protocol treasury
                 - 1% to whoever triggered it
```

**Example:** With default 90-day period, total timeout is 150 days.

No human decides this. The blockchain does. Automatically.

### 4. Automatic Proof of Activity

**Direct outgoing token transfers reset your timer automatically** (for registered wallets).

If you send tokens directly from your wallet (i.e. you are `msg.sender`), your timer resets. Third-party transfers via `transferFrom()` (DEX swaps, approved spenders) do **not** reset your timer — this prevents allowance-based timer manipulation.

If your wallet goes dormant, you can manually confirm activity via `confirmActivity()` or any setup action (designate successor, change inactivity period, update vault data).

### Activity Rules (Quick Reference)

| Action | Resets timer? | Why |
|--------|:---:|-----|
| Send WILL directly (`transfer()`) | Yes | You are `msg.sender` — proves liveness |
| Call `confirmActivity()` | Yes | Explicit proof of life |
| Change successor / inactivity period / vault data | Yes | Setup actions prove liveness |
| Cancel an inheritance claim | Yes | Owner vetoing proves liveness |
| DEX swap via token approval (`transferFrom()`) | **No** | Third-party spender — cannot prove *your* liveness (M-01 fix) |
| Someone sends you WILL | **No** | Receiving tokens is passive |
| Approve a spender (`approve()`) | **No** | Approval alone is not a transfer |

**If you trade on DEXes** (Uniswap, Aerodrome, etc.) via approve/transferFrom: call `confirmActivity()` manually after trading to reset your timer.

---

## What Happens To "Dead" Tokens

When someone exceeds their total timeout (90–425 days depending on settings):

| Portion | Destination | Why |
|---------|-------------|-----|
| 47% | **Burned forever** | Reduces supply, benefits all holders |
| 47% | **Dividend pool** | Registered active holders claim via `claimDividends()` |
| 5% | **Protocol treasury** | Sustainable development fund |
| 1% | **Whoever triggered it** | Incentive to clean up the network |

**Pull Pattern:** Dividends aren't pushed automatically (saves gas). You claim them when you want.

---

## Common Questions

### "What if I lose my phone?"

Use any device with your wallet to send a direct transfer or call `confirmActivity()`. Note: DEX swaps via token approvals do not count — confirm activity manually after trading.

### "What if I'm in a coma?"

With the default 90-day period, you have 150 days total. If you set a successor, they can initiate a claim after 90 days — but you can cancel it when you wake up.

**Pro tip:** Long-term holders can set the 365-day period for 425 days total timeout.

### "Can the developers rug pull?"

No. The contract has no admin keys, no pause function, no upgrade path. Once deployed, it runs forever.

The only admin action is changing the treasury address — which requires a **2-day timelock**. Anyone can observe this on-chain before it takes effect.

### "What if there's a bug?"

300+ automated tests cover all edge cases. The code will be externally audited before mainnet. But yes, smart contracts can have bugs. Use only what you can afford to lose.

---

## The Honest Truth

WillChain is an experiment. We're testing if:

1. The burn/redistribute mechanic creates real value
2. Trustless inheritance is something people want
3. A token that punishes inactivity has a sustainable economy

You're early. That means risk AND opportunity.

---

## Technical Details

**Network:** Base (Ethereum L2)
**Token:** WILL (ERC-20)
**Supply:** 1,000,000,000 (fixed, no minting ever)
**Contract:** Single contract — `WillChain.sol` (~800 lines)
**Inactivity Periods:** 30, 90 (default), 180, or 365 days
**Grace Period:** 30 days
**Claim Period:** 30 days
**Default Total Timeout:** 150 days (90 + 30 + 30)
**Security:** Ownable2Step, ReentrancyGuard, flashloan protection, treasury 2-day timelock

**Distribution on Recycling:**
- 47% burned, 47% dividend pool, 5% protocol, 1% maintainer

---

## Get Started

1. Get some WILL tokens
2. Designate your heir: `designateSuccessor(address)` — this auto-registers your vault
3. (Optional) Customize your inactivity period (30/90/180/365 days) — default is 90 days
4. Use your wallet normally — direct transfers reset your timer automatically
5. DEX swaps via approvals do **not** reset your timer — call `confirmActivity()` after trading

Your vault is now protected by math, not trust.

---

*WillChain — Secure Your Digital Legacy*

© 2026 WillChain
This is experimental software. Use at your own risk.
