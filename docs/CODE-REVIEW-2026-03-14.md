# WillChain Code Review — 2026-03-14

Full-project review: bot, frontend, shared/scripts, smart contract.
Reviewed and validated with second opinion.

## General Assessment

Project is **mature and well-structured**. Contract is production-ready, frontend is solid, bot is functional. Most initial findings were either already handled, premature optimization, or dev tooling concerns.

---

## Confirmed Bugs — fix now

| # | Component | Issue | Status |
|---|-----------|-------|--------|
| 1 | **bot/cron.js:145** | `recycle.processPendingCommits()` — `recycle` module not imported. Currently safe because `CONFIG.recycleEnabled = false`, but will crash when recycle is enabled | BUG |
| 2 | **frontend/TgLinkModal.tsx:42-50** | `BigInt(tgid)` without try-catch — malformed URL param crashes the component | BUG |
| 3 | **frontend/DisclaimerContext.tsx:19** | `localStorage` without try-catch — throws in private browsing mode | EDGE CASE |

---

## Valid but not urgent

| # | Component | Issue | Notes |
|---|-----------|-------|-------|
| 4 | **bot/api.js:210** | `/health` — `provider.getBlockNumber()` without explicit timeout | ethers.js has default timeout; not observed in practice. `Promise.race` would add reliability |
| 5 | **bot/events.js:68-74** | `Promise.all` for 6 queryFilter — partial failure drops batch | Catch on line 62 handles it; retry on next poll. Individual try-catch would allow partial progress |
| 6 | **frontend/TransferModal.tsx:54-65** | Error from `writeContract` caught silently | Needs verification — user may not see feedback |
| 7 | **bot/database.js:146,152** | String interpolation in SQL (Date.now — safe value) | Not a vulnerability, but bad pattern to copy |
| 8 | **scripts/translate-langs.mjs:87** | JSON parsing with regex, no error handling for malformed Gemini response | Script-level, not production |

---

## Dismissed findings (with reasoning)

| # | Original finding | Why dismissed |
|---|-----------------|---------------|
| 5 | hardhat PRIVATE_KEY check | Dev tooling — deploy without key fails with clear error |
| 6 | npm audit 37 vulnerabilities | All in dev dependencies (hardhat, foundry tooling). Not in production bundle |
| 7 | Dashboard React.memo | 14 components re-rendering every 30s is negligible. Premature optimization |
| 8 | TimeCard SVG every second | Single SVG update per second — normal, not a performance issue |
| 12 | ALTER TABLE bare catch | Intentional — idempotent migrations, "column already exists" is expected |
| 14 | vite proxy hardcoded | Dev-only proxy; nginx handles prod |
| 20 | rateLimitMap unbounded | Already has cleanup every 5 minutes (lines 35-40) |

---

## Low priority — nice to have

| # | Component | Issue |
|---|-----------|-------|
| 15 | **frontend/TimeCard SVG** | Missing `role="img"` + `aria-label` for screen readers |
| 16 | **frontend/Header.tsx:84** | Language dropdown missing `aria-haspopup="menu"` |
| 17 | **frontend** | Magic numbers (`86400`, `1e18`) — could extract to constants |
| 18 | **bot/recycle.js:157** | Fragile error matching by message text instead of error codes |
| 19 | **bot/notifications.js:73-78** | Contract call fallback without logging |

---

## Smart Contract (WillChain.sol)

**No critical vulnerabilities found.** All good:
- ReentrancyGuard on all write functions
- Flashloan protection (per-block guard)
- M-01 fix (delegated spending lock) works correctly
- Dividend accumulator (Synthetix pattern) — correct
- Treasury timelock 2 days
- CEI pattern followed throughout

Only recommendation — **external audit before mainnet** (already in roadmap).

---

## Action Items

1. **Import `recycle` in cron.js** — real bug, will crash when recycleEnabled = true
2. **Add URL param validation in TgLinkModal** — wrap BigInt in try-catch, validate nonce format
3. **Wrap localStorage in try-catch** in DisclaimerContext — private browsing edge case
