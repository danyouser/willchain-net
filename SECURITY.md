# Security Policy

## Supported Versions

WillChain is currently in pre-mainnet testnet phase on Base Sepolia. Only the latest deployed version is supported.

| Version | Supported |
|---------|-----------|
| Latest testnet | ✅ |
| Older deployments | ❌ |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

### How to Report

Email: **security@willchain.net**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (optional)

You will receive acknowledgment within **48 hours** and a status update within **7 days**.

### Scope

**In scope:**
- `contracts/WillChain.sol` — smart contract logic
- `bot/src/` — Telegram bot (authentication, EIP-712 verification)
- `frontend-react/src/` — React frontend

**Out of scope:**
- Third-party dependencies (report to their maintainers)
- Theoretical attacks with no realistic exploitation path
- UI/UX bugs without security impact
- Issues in test files

## Security Architecture

### Threat Model

WillChain is a dead man's switch token. The primary threat vectors are: premature token loss (false positive inactivity), unauthorized vault claims, dividend manipulation, and MEV exploitation during recycling. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) for the complete threat model.

### Security Assumptions

1. **Owner key safety**: If a wallet private key is compromised, an attacker can confirm activity indefinitely — this is by design (key holder = alive).
2. **Successor designation**: A maliciously designated successor cannot claim until the full inactivity + grace + claim window expires (~150+ days by default).
3. **Flashloan protection**: State-changing functions require `lastTransferBlock[msg.sender] < block.number` to prevent same-block flashloan attacks.
4. **Reentrancy**: All critical state-changing functions use OpenZeppelin `ReentrancyGuard`.
5. **Smart Wallet support**: No `tx.origin` checks — Gnosis Safe, ERC-4337, and other smart wallets are fully supported.
6. **No upgradeability**: The contract is immutable once deployed. There are no proxy patterns or admin upgrade paths.
7. **MEV protection**: Freshly ABANDONED nodes (< 24h) require commit-reveal recycling to prevent front-running.

### Contract Invariants

The following invariants hold across all operations:

1. **totalSupply only decreases** — no tokens are minted after constructor
2. **dividendPool ≤ contract token balance** — always solvent
3. **totalUnregisteredSupply = Σ balances of unregistered addresses** — dividend exclusion correctness
4. **UNREGISTERED addresses earn zero dividends** — enforced by accumulator snapshots
5. **Distribution BPS sum to 10,000** — 1% maintainer + 5% treasury + 47% burn + 47% dividends

See [docs/INVARIANTS.md](docs/INVARIANTS.md) for the complete invariant specification.

### Accepted Trade-offs

- `transferFrom()` by approved spenders does NOT reset the activity timer (prevents allowance-based griefing, but DEX swaps don't count as activity)
- No re-minting after burns — total supply is strictly deflationary
- `recoverDividendDust()` is admin-callable but capped at 0.1% of totalSupply per call
- Bot notifications are best-effort — the bot is not a security guarantee
- Circular successor chains are only blocked one level deep (A→B→A, not A→B→C→A)

See [docs/ACCEPTED-TRADEOFFS.md](docs/ACCEPTED-TRADEOFFS.md) for the full list.

### Scope of Guarantees

The protocol provides formal guarantees about safety, liveness, and termination properties. See [docs/ASSUMPTIONS-AND-GUARANTEES.md](docs/ASSUMPTIONS-AND-GUARANTEES.md) for 14 guarantees (G1–G14) and 10 non-guarantees (N1–N10).

## Audit Status

| Audit | Status |
|-------|--------|
| Internal security review | ✅ Complete (52 findings, all resolved) |
| AI-assisted cross-reference (GPT-4o, Claude) | ✅ Complete |
| Static analysis (Slither) | ✅ Integrated in CI |
| Fuzz testing (Foundry, 10 × 10,000 runs) | ✅ Passing |
| External professional audit | 🔜 Planned before mainnet |
| Formal verification (Certora/Halmos) | 🔜 Planned |
| Bug bounty program (Immunefi) | 🔜 Planned before mainnet |

See [docs/SECURITY-AUDIT-REPORT.md](docs/SECURITY-AUDIT-REPORT.md) for the full audit report.

## Disclosure Policy

We follow **responsible disclosure**:
- You agree not to publish details before a fix is deployed
- We will credit you in the fix announcement (unless you prefer anonymity)
- We aim to fix critical issues within **14 days**, high severity within **30 days**

## Bug Bounty

There is currently no formal bug bounty program. Significant findings may be rewarded at our discretion. We will announce a formal program before mainnet launch.
