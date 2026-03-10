# Beta Ops — Observation Protocol

Post-freeze operational discipline for testnet beta.
Goal: observe, document, don't change protocol semantics.

---

## Daily Checks

```bash
# 1. Release gate (takes ~12s)
npm run qa:quick

# 2. Bot health
curl -s http://127.0.0.1:3001/health | jq '{ok, blockLagAlert, lastEventBlock, uptime}'

# 3. Bot process
systemctl is-active willchain-bot

# 4. Recent errors
sudo journalctl -u willchain-bot --since "24 hours ago" --priority err --no-pager | head -20

# 5. Database size (should stay under 50MB)
du -sh bot/data/phoenix_bot.db
```

If any check fails — log in `BETA-FINDINGS-LOG.md`, fix, re-run gate.

---

## Weekly Review

Every week, answer these 5 questions:

1. **What broke?** List incidents from the findings log.
2. **What confused users?** List confusion patterns.
3. **What was fixed?** List changes made during the week.
4. **What remains a risk?** Any unresolved issues.
5. **Are we closer to mainnet criteria?** Check `MAINNET-CRITERIA.md`.

---

## Alert Correctness Audit

Not just "alert arrived", but:

| Check | How |
|-------|-----|
| **Timing** | Alert within 1 block of on-chain event? |
| **Recipient** | Correct Telegram user received it? |
| **Content** | Status, address, amounts correct? |
| **No duplicates** | Same event not alerted twice? |
| **No misses** | Every transition triggered an alert? |

Log discrepancies in findings log as `ALERT-*` entries.

---

## Revert Hotspot Monitoring

Track which contract calls revert most often:

| Action | Expected Reverts | Watch For |
|--------|-----------------|-----------|
| `designateSuccessor` | Zero address, self, circular | User confusion about address format |
| `confirmActivity` | Unregistered with 0 balance | Users who hold 0 WILL trying to register |
| `initiateSuccessorClaim` | Not successor, already initiated, ABANDONED | Timing confusion |
| `completeVaultTransfer` | Too early, not initiated | Claim window misunderstanding |
| `recycleInactiveNode` | Not ABANDONED, fresh (commit-reveal) | MEV/timing edge cases |
| `claimDividends` | No pending dividends | Users expecting instant dividends |

---

## What CAN Be Changed During Beta

| Category | OK to change | Needs justification |
|----------|-------------|-------------------|
| UI copy / wording | Yes, freely | — |
| i18n translations | Yes, freely | — |
| Docs / explanations | Yes, freely | — |
| Tests (add more) | Yes, freely | — |
| Bot alert messages | Yes | Log the change |
| Frontend layout/styling | Yes | Log the change |
| Frontend validation logic | With care | Log + test |
| Bot event handling | With care | Log + test + mini-rehearsal |
| Contract constants | NO | Only with proven defect + full QA |
| State machine logic | NO | Only with proven defect + full QA |
| Recycling distribution | NO | Only with proven defect + full QA |

---

## Mini-Rehearsal (After Any Fix)

```bash
# 1. Tests
npm run qa:quick

# 2. If contract changed:
npx hardhat test
forge test --match-contract WillChainFuzz --fuzz-runs 1000

# 3. If frontend changed:
cd frontend-react && npm run lint && npm test && npm run build

# 4. If bot changed:
cd bot && npm test

# 5. Playwright smoke
cd frontend-react && npx playwright test
```

---

## Telemetry Guidelines

Collect without violating trust:

| OK to collect | NOT OK |
|---------------|--------|
| Which screens are opened | Wallet addresses |
| Where users drop the flow | Token balances |
| Which buttons are clicked | Transaction details |
| Where tx fails (revert reason) | IP addresses |
| Page load times | Personal data |
| Console error frequency | Cross-site tracking |

---

*Last updated: 2026-03-10*
