# Accepted Tradeoffs

What is intentionally allowed, what is not protected, and what users must understand before using WillChain.

---

## What Is Intentionally Allowed

### T-01: Owner can change treasury address (with 2-day timelock)
The contract owner can propose a new treasury address via `proposeTreasuryChange()`. After a 2-day delay, the owner calls `executeTreasuryChange()` to apply it. This is observable on-chain before it takes effect.

**Why accepted:** Protocol needs a mechanism for treasury rotation (key compromise, migration). The 2-day delay provides transparency.

### T-02: Block timestamp dependence for timers
All timer logic uses `block.timestamp`. Miners/sequencers can manipulate this by ~15 seconds.

**Why accepted:** WillChain uses day-scale periods (30-365 days). 15-second precision is irrelevant. Base L2 has a single sequencer, making manipulation even less viable.

### T-03: MEV on `recycleInactiveNode()` (stale ABANDONED)
After the 24-hour commit-reveal window expires, `recycleInactiveNode()` is callable by anyone. A frontrunner can steal the 1% caller reward.

**Why accepted:** The 1% reward is an incentive, not a prize. The commit-reveal window protects the first 24 hours. After that, any caller is fine — the protocol benefits regardless of who triggers recycling.

### T-04: `transferFrom()` does not reset any timer + blocked on non-ACTIVE vaults (M-01 fix)
When Alice approves Bob, and Bob calls `transferFrom(Alice, Charlie, amount)`, **neither** Alice's nor Bob's timer resets. Only direct transfers where `msg.sender == from` count as activity. Additionally, delegated spending (`transferFrom`/`burnFrom` by third-party spenders) is completely blocked when the vault is not ACTIVE — reverts with `DelegatedSpendingBlocked()` in GRACE, CLAIMABLE, and ABANDONED states. UNREGISTERED addresses are not affected (normal ERC-20 behavior).

**Why accepted:** This is the M-01 fix — prevents allowance-based timer griefing and protects inactive vault balances from being drained by pre-existing allowances. The inheritance promise (inactive balance → successor or recycle) is now enforced at the contract level. Users who trade via DEX (which uses allowance/transferFrom) should call `confirmActivity()` explicitly to prove liveness.

### T-05: `recoverDividendDust()` is direct owner action (no timelock)
Unlike treasury changes, dividend dust recovery has no 2-day delay.

**Why accepted:** This function only transfers unclaimed fractions (<1 wei per holder) to the protocol treasury (or owner if treasury is unset). The maximum extractable value is capped at 0.1% of totalSupply per call. Adding a timelock would add complexity for no security benefit.

### T-06: No formal verification (Certora/Halmos)
The contract has not been formally verified using mathematical proof tools.

**Why accepted:** 299 Hardhat tests + 10 Foundry fuzz tests (10,000 runs each) + Slither CI provide strong empirical coverage. Formal verification is planned for mainnet but is not a blocker for testnet beta.

---

## What Is NOT Protected

### U-01: Private key compromise
If a user loses their private key, WillChain cannot help. The contract has no admin recovery, no social recovery, no emergency pause.

### U-02: Smart contract bugs (residual risk)
Despite extensive testing, smart contracts can have undiscovered bugs. The code will be externally audited before mainnet.

### U-03: Base L2 sequencer downtime
If the Base sequencer goes offline, no transactions can be processed. Timers continue based on block timestamps, which could lead to unexpected state transitions when the sequencer resumes.

### U-04: Frontend availability
The Telegram bot and web frontend are centralized services. If they go down, users can still interact directly with the contract via Basescan or any Ethereum client.

### U-05: Token price
WillChain makes no guarantees about the price or value of WILL tokens. The burn/dividend mechanics affect supply but do not guarantee appreciation.

---

## What Users Must Understand

1. **Your tokens are in YOUR wallet.** WillChain tracks state, not custody. If you lose your wallet, you lose your tokens.

2. **Inactivity has consequences.** If you stop transacting for your chosen period (30-365 days) + 60 days (grace + claim), your tokens will be recycled: 47% burned, 47% distributed, 5% to treasury, 1% to the caller.

3. **Setting a successor helps.** Your successor can claim during the grace/claim window. But if nobody claims and the full timeout expires, recycling happens automatically.

4. **The contract is immutable.** Once deployed, nobody — not even the developers — can modify the contract logic, pause it, or upgrade it. The only admin action is treasury address rotation with a 2-day delay.

5. **This is testnet beta.** The current deployment is on Base Sepolia. Real value is at risk only after mainnet deployment and external audit.

---

## Deferred to Mainnet

| Item | Priority | Rationale |
|------|----------|-----------|
| External audit (Trail of Bits / Code4rena) | Required | No mainnet without third-party review |
| Multisig governance (Safe) | Required | Owner key must not be a single EOA on mainnet |
| Formal verification (Certora) | Recommended | Mathematical proof of dividend invariants |
| Chainlink Keepers (automated recycling) | Nice-to-have | Removes reliance on manual recycling callers |
| Cross-chain deployment (LayerZero) | Future | Not needed for MVP |

---

*Last updated: 2026-03-10*
