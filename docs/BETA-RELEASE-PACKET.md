# Beta Release Packet

Testnet Beta Freeze — 2026-03-10

---

## Contract

| Field | Value |
|-------|-------|
| Contract | `WillChain.sol` |
| Address | `0x6fAd1475B41731E3eDA21998417Cb2e18E795877` |
| Network | Base Sepolia (Chain ID `84532`) |
| Solidity | `0.8.24` |
| Framework | Hardhat + OpenZeppelin Contracts v5 |
| Token | WILL (ERC-20, 18 decimals, 1B fixed supply) |

## ABI

Canonical ABI source: `frontend-react/src/config/contract.ts`

Shared config: `shared/contract-config.js`

Generated reference: `docs/GENERATED-REFERENCE.md` (auto-generated, CI-enforced sync)

## Test Results

| Suite | Count | Status |
|-------|-------|--------|
| Hardhat (contract) | 299 | All passing |
| Foundry fuzz | 10 x 10,000 runs | All passing |
| Shared / utility (node:test) | 197 | All passing |
| React (vitest) | 44 | All passing |
| Bot (node:test) | 124 | All passing |
| Playwright E2E | 28 | All passing |
| **Total** | **702** | **All green** |

Coverage: Branches >= 88%, Statements >= 94% (CI-enforced thresholds)

## Build Status

| Component | Status |
|-----------|--------|
| Contract compile | Green |
| Frontend lint | 0 errors |
| Frontend build | Green, all chunks < 700kB |
| Frontend TypeScript | `tsc -b` clean |
| Bot tests | Green |
| Slither static analysis | 0 High severity (3 accepted Medium — see `docs/SLITHER-ACCEPTED.md`) |
| Config drift | All checks passing |
| Docs generation sync | In sync |

## CI Pipeline

8 parallel jobs in `.github/workflows/ci.yml`:
1. Contract (Hardhat) — compile, test, coverage thresholds, gas snapshot
2. React Frontend — lint, test, build, bundle budget
3. Shared & Utility Tests — 7 test files including canonical fixtures + CI assertions + docs sync
4. Bot (Node.js) — test, audit
5. Foundry Fuzz — 10 invariant tests x 10,000 runs
6. Playwright E2E — 28 smoke tests
7. Docker Build — bot container image
8. Slither Static Analysis — High severity = CI failure
9. Config Drift — contract address, chain ID, timing constants, branding

## Canonical Documents

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/PROTOCOL-SPEC.md` | Protocol specification | Current |
| `docs/PROTOCOL-TRUTH.md` | Source of truth for semantics | Current |
| `docs/INVARIANTS.md` | 20 formal invariants | Current |
| `docs/SECURITY-MODEL.md` | Security architecture | Current |
| `docs/THREAT-MODEL.md` | 10 risk assessments | Current |
| `docs/ACCEPTED-TRADEOFFS.md` | What is/isn't protected | Current |
| `docs/SLITHER-ACCEPTED.md` | Accepted Slither findings | Current |
| `shared/fixtures/canonical-states.json` | 11 states, 12 transitions | Current |
| `docs/GENERATED-REFERENCE.md` | Auto-generated ABI reference | CI-enforced sync |

## Known Risks for Beta

See `docs/ACCEPTED-TRADEOFFS.md` for full list. Summary:

| Risk | Severity | Status |
|------|----------|--------|
| No external audit | High | Required before mainnet |
| Owner is single EOA (not multisig) | Medium | Required before mainnet |
| No formal verification | Medium | Deferred to mainnet |
| Base sequencer downtime | Low | Accepted (L2 inherent) |
| MEV on stale recycling | Low | Mitigated by commit-reveal window |
| Frontend/bot centralization | Low | Users can interact via Basescan |

## Operator Resources

| Resource | Location |
|----------|----------|
| Bot deployment runbook | `docs/BOT-DEPLOY.md` |
| API specification | `docs/API.md` |
| Deploy script | `scripts/deploy.js` |
| Health check | `GET /health` on bot API |
| Release gate | `npm run qa` (full) / `npm run qa:quick` |

---

*Generated: 2026-03-10*
