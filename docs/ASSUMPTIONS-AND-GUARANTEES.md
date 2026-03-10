# WillChain — Assumptions and Guarantees

> Institutional-grade clarity on what the protocol guarantees, what it does not,
> and what assumptions must hold for correct operation.
>
> See `docs/PROTOCOL-TRUTH.md` for the canonical state machine.

---

## What the Protocol GUARANTEES (on-chain, unconditional)

| # | Guarantee | Mechanism |
|---|-----------|-----------|
| G1 | No one can steal tokens without the owner being inactive for `inactivityPeriod + 60 days` minimum | State machine enforced on-chain |
| G2 | UNREGISTERED addresses earn zero dividends | `totalUnregisteredSupply` subtracted from eligible supply |
| G3 | Treasury cannot be changed without a 2-day public timelock | `proposeTreasuryChange` → `executeTreasuryChange` |
| G4 | Ownership cannot be taken by a single tx — requires 2-step acceptance | `Ownable2Step` |
| G5 | `renounceOwnership()` is permanently disabled | Overridden to revert |
| G6 | Circular successor chains (A→B→A) are rejected on-chain | Explicit check in `designateSuccessor` |
| G7 | A node's own address cannot be its successor | `require(_successor != msg.sender)` |
| G8 | Contract address cannot be treasury or successor | Explicit checks |
| G9 | `initiateSuccessorClaim` is blocked once node reaches ABANDONED | Upper bound enforced |
| G10 | `vaultDataHash` cannot be cleared to bytes32(0) | `require(_dataHash != bytes32(0))` |
| G11 | Same-block flashloan attacks on recycle/claim are blocked | `lastTransferBlock[addr]` per-user |
| G12 | Dividend pool accounting is O(1) — no loops, no gas bombs | Synthetix-style accumulator |
| G13 | BPS distribution always sums to 10000 (no token leakage on recycle) | Verified: 4700+4700+500+100=10000 |
| G14 | `totalRemovedFromCirculation` only ever increases | Append-only counter |

---

## What the Protocol DOES NOT Guarantee

| # | Non-Guarantee | Explanation |
|---|--------------|-------------|
| N1 | That the owner is truly deceased or incapacitated | Protocol cannot verify real-world events |
| N2 | Off-chain data availability (vaultDataHash content) | IPFS/storage is user's responsibility |
| N3 | Bot or email notifications are delivered | Best-effort, off-chain |
| N4 | Front-running of `recycleInactiveNode` is prevented | By design — 1% reward incentivizes it |
| N5 | That a designated successor is the intended heir | Social/legal responsibility of owner |
| N6 | Protection against allowance abuse (see T1 in PROTOCOL-TRUTH.md) | ERC-20 standard behavior |
| N7 | Multi-block sophisticated attacks | Only atomic same-block protection |
| N8 | Correct behavior if the node is a smart contract wallet with custom logic | Tested with Safe/4337, but edge cases exist |
| N9 | Liveness of the recycler (someone must call `recycleInactiveNode`) | Decentralized — anyone can call for 1% reward |
| N10 | CEX wallets will ever "die" and trigger inheritance | CEX holds keys; CEX address won't go inactive |

---

## Operator Assumptions

These must hold for the system to operate correctly end-to-end:

| # | Assumption | Who is responsible |
|---|-----------|-------------------|
| A1 | RPC endpoint (Base Sepolia/Base) remains available | Operator / user |
| A2 | Bot process is running and connected to the correct RPC | Bot operator |
| A3 | `DEPLOYMENT_BLOCK` in bot config is set to the correct block | Bot operator (permanent miss if wrong) |
| A4 | Treasury address is a multisig (Safe or equivalent) before mainnet | Protocol owner |
| A5 | Bot Telegram API token is kept secret | Bot operator |
| A6 | `bot/.env` is not committed to git | Bot operator |
| A7 | Domain (willchain.net) TLS certificate is valid | Operator |
| A8 | The IPFS or storage reference in `vaultDataHash` remains accessible | User |

---

## Security Properties (formal-style)

**Safety (nothing bad happens):**
- An ACTIVE node's tokens cannot be transferred to the successor without passing through GRACE → CLAIMABLE.
- Dividends cannot flow to UNREGISTERED addresses.
- Treasury cannot be changed in less than 2 days.
- Ownership cannot be taken without the new owner's acceptance.

**Liveness (good things eventually happen):**
- An ABANDONED node CAN always be recycled (no blocking condition).
- A registered holder CAN always claim dividends (pull pattern, no admin gate).
- A node owner CAN always call `confirmActivity()` to return to ACTIVE until ABANDONED.

**Termination:**
- The state machine has no infinite loops. Every state can reach ABANDONED or ACTIVE.
- `recycleInactiveNode` terminates in O(1) — no iteration.

---

## Threat Model Summary

```
TRUST BOUNDARY: Everything inside the smart contract is trustless.
                Everything outside (bot, frontend, user) is trusted-but-verified.

HIGH TRUST:   Smart contract (WillChain.sol) — immutable, on-chain
MEDIUM TRUST: Shared module (vault-status.js) — logic mirrors contract, tested
MEDIUM TRUST: Bot (Grammy + SQLite) — best-effort, not a security primitive
LOW TRUST:    Frontend — UI convenience only, not a security primitive
ZERO TRUST:   External RPC providers, IPFS, Telegram API
```

**Attack surfaces by severity:**

| Surface | Severity | Mitigated by |
|---------|----------|-------------|
| Smart contract bug | Critical | 299 Hardhat + 10 Foundry fuzz tests, 90% branch coverage, Slither CI |
| Owner key compromise | Critical | Ownable2Step + Safe multisig (pre-mainnet) |
| Treasury key compromise | High | 2-day timelock, Safe multisig |
| Bot API key leak | Medium | Rate limiting, SQLite persistence, graceful shutdown |
| RPC manipulation | Medium | Events are re-scanned from `DEPLOYMENT_BLOCK` on restart |
| Frontend XSS | Low | React (no innerHTML), CSP headers on deploy |
| Social engineering of successor | None | Out of scope — user responsibility |

---

## Change Management Policy

| Change type | Required process |
|-------------|-----------------|
| Smart contract upgrade | New deployment + migration (not upgradeable) |
| Treasury address change | `proposeTreasuryChange()` → 2-day wait → `executeTreasuryChange()` |
| Bot config change | Update `bot/.env`, restart process, verify `/health` |
| Frontend deploy | CI passes → build → static deploy |
| Protocol parameter change (periods, BPS) | Requires new contract version — immutable |

---

## Known Trade-offs (accepted by design)

| # | Trade-off | Rationale | Mitigation |
|---|-----------|-----------|------------|
| T1 | `transferFrom` does NOT reset timer | Prevents allowance-based griefing (M-01 fix) — a spender could keep a vault alive indefinitely | DEX users must call `confirmActivity()` separately |
| T2 | MEV on recycle reward (1%) | Front-runners can snipe the 1% caller reward | Commit-reveal for first 24h of ABANDONED; direct after 24h |
| T3 | Dividend dust truncation | Integer division leaves small dust in `dividendPool` | `recoverDividendDust()` capped at 0.1% of totalSupply per call |
| T4 | No contract pause | Censorship resistance — no one can freeze the protocol | Bug requires redeploy + migration; users re-register |
| T5 | `recoverDividendDust` has no timelock | Dust amounts are negligible; 0.1% cap limits extraction | Requires `onlyOwner` + `nonReentrant`; ~1,000 calls to drain 100% |
| T6 | ABANDONED resurrection race | Owner can resurrect (confirmActivity) before recycler acts | No fix needed — this is desired "I'm alive" behavior |
| T7 | No automatic delegation | Smart contract wallets must call `transfer()` directly | Documented in SECURITY-MODEL.md; Safe/ERC-4337 work correctly |

---

## Pre-Mainnet Checklist (governance)

- [ ] Treasury = Gnosis Safe multisig (≥2/3 signers)
- [ ] External security audit completed
- [ ] Bug bounty program active
- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] `DEPLOYMENT_BLOCK` set to mainnet deploy block
- [ ] Bot rate limits and alerts tested under load
- [ ] Runbook reviewed and signed off by operators
- [ ] Emergency contact list established

---

*This document is a living governance artifact. Update on every material protocol change.*
*Cross-reference: `docs/PROTOCOL-TRUTH.md` (canonical spec), `docs/RUNBOOK.md` (operations).*
