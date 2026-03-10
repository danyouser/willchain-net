# WillChain — Mainnet Readiness Checklist

Final gate before Base mainnet deployment.
All 9 sections must be GREEN. Any RED section is a hard stop.

---

## 1. External Audit Package Ready

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1.1 | Architecture overview finalized | [AUDIT-PACK.md](./AUDIT-PACK.md) | [x] |
| 1.2 | Protocol truth / spec finalized | [PROTOCOL-SPEC.md](./PROTOCOL-SPEC.md), [PROTOCOL-TRUTH.md](./PROTOCOL-TRUTH.md) | [x] |
| 1.3 | Invariants finalized (20 formal) | [INVARIANTS.md](./INVARIANTS.md) | [x] |
| 1.4 | Accepted tradeoffs documented | [ACCEPTED-TRADEOFFS.md](./ACCEPTED-TRADEOFFS.md) | [x] |
| 1.5 | Threat model finalized | [THREAT-MODEL.md](./THREAT-MODEL.md) | [x] |
| 1.6 | Latest test/build summary attached | [GO-NO-GO.md](./GO-NO-GO.md) | [x] |
| 1.7 | Contract/file map prepared for reviewers | [AUDIT-PACK.md § Scope](./AUDIT-PACK.md) | [x] |

**Section status: GREEN**

---

## 2. External Validation Completed

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 2.1 | Independent audit performed | — | [ ] |
| 2.2 | Findings triaged | — | [ ] |
| 2.3 | All serious findings fixed or explicitly accepted | — | [ ] |
| 2.4 | Public/private vuln disclosure path prepared | [SECURITY.md](../SECURITY.md) | [x] |
| 2.5 | SECURITY.md finalized | [SECURITY.md](../SECURITY.md) | [x] |

**Section status: RED** — blocked on external audit engagement

---

## 3. Real-User Beta Validated

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 3.1 | Controlled beta completed | — | [ ] |
| 3.2 | No protocol-level incidents | — | [ ] |
| 3.3 | No unresolved critical UX confusion (onboarding / claim / recycle) | — | [ ] |
| 3.4 | Bot alerts validated against real flows | — | [ ] |
| 3.5 | Docs matched real user behavior | — | [ ] |

**Section status: RED** — blocked on beta launch

---

## 4. Quality Gates Locked

| # | Criterion | How to verify | Status |
|---|-----------|---------------|--------|
| 4.1 | TypeScript green | `cd frontend-react && npx tsc -b` | [x] |
| 4.2 | Build green | `cd frontend-react && npm run build` | [x] |
| 4.3 | Hardhat tests green (299) | `npx hardhat test` | [x] |
| 4.4 | Bot tests green (124) | `cd bot && npm test` | [x] |
| 4.5 | Frontend tests green (44 vitest) | `cd frontend-react && npx vitest run` | [x] |
| 4.6 | E2E smoke green (28 Playwright) | `cd frontend-react && npx playwright test` | [x] |
| 4.7 | Foundry fuzz green (10 × 10,000) | `forge test --match-path test/foundry/` | [x] |
| 4.8 | Slither static analysis (0 High) | CI Slither job | [x] |
| 4.9 | Docs/fixture/ABI drift checks green | `npm run qa` config-drift check | [x] |
| 4.10 | 3 consecutive green CI runs | CI history | [ ] |

**Section status: GREEN** (4.10 pending — requires CI runs closer to mainnet)

---

## 5. Operational Readiness Proven

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 5.1 | Full deploy rehearsal completed | — | [ ] |
| 5.2 | Verify flow completed (Basescan) | — | [ ] |
| 5.3 | Frontend config rehearsal completed | — | [ ] |
| 5.4 | Bot/API startup and recovery tested | — | [ ] |
| 5.5 | Event processing checked end-to-end | — | [ ] |
| 5.6 | Incident drill completed | [RUNBOOK.md](./RUNBOOK.md) | [ ] |
| 5.7 | Rollback reasoning documented | [BOT-DEPLOY.md](./BOT-DEPLOY.md) | [ ] |

### Deploy Rehearsal Steps

```bash
# 1. Compile
npx hardhat compile

# 2. Deploy to testnet
npx hardhat run scripts/deploy.js --network baseSepolia

# 3. Verify on explorer
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>

# 4. Update config files
#    - shared/contract-config.js
#    - frontend-react/src/config/contract.ts
#    - bot/.env (CONTRACT_ADDRESS, DEPLOYMENT_BLOCK)

# 5. Run config drift check
npm run qa

# 6. Start bot, verify /health
cd bot && node src/index.js
curl -s http://127.0.0.1:3001/health | jq

# 7. Build frontend
cd frontend-react && npm run build

# 8. Smoke test
cd frontend-react && npx playwright test

# 9. Full QA gate
npm run qa
```

**Section status: RED** — rehearsal not yet performed

---

## 6. Governance Hardened

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 6.1 | Owner moved to multisig (Gnosis Safe) | Basescan owner check | [ ] |
| 6.2 | Treasury is multisig (Gnosis Safe) | Basescan treasury check | [ ] |
| 6.3 | Signer policy documented (N-of-M, devices, people) | — | [ ] |
| 6.4 | Emergency powers documented | — | [ ] |
| 6.5 | Treasury/admin procedures documented | Treasury timelock: propose → 2d wait → execute | [x] |
| 6.6 | Key management finalized (deployer wallet, rotation) | — | [ ] |

**Section status: RED** — blocked on Safe setup

---

## 7. Release Artifacts Frozen

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 7.1 | Final ABI snapshot | [GENERATED-REFERENCE.md](./GENERATED-REFERENCE.md) (CI-synced) | [ ] |
| 7.2 | Final docs snapshot | All docs in `docs/` | [ ] |
| 7.3 | Final fixtures snapshot | `shared/fixtures/canonical-states.json` | [ ] |
| 7.4 | Final test report snapshot | [GO-NO-GO.md](./GO-NO-GO.md) | [ ] |
| 7.5 | Final known-tradeoffs snapshot | [ACCEPTED-TRADEOFFS.md](./ACCEPTED-TRADEOFFS.md) | [ ] |
| 7.6 | Versioned release notes | CHANGELOG.md | [ ] |

**Section status: RED** — freeze happens after audit + beta

---

## 8. Monitoring & Response Ready

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 8.1 | API health checks live (UptimeRobot/Checkly) | `/health` endpoint exists | [ ] |
| 8.2 | Bot lag monitoring live | `blockLagAlert` in `/health` response | [x] |
| 8.3 | Alert correctness monitored | Beta validation needed | [ ] |
| 8.4 | Incident log process defined | [BETA-FINDINGS-LOG.md](./BETA-FINDINGS-LOG.md) | [x] |
| 8.5 | Escalation/contact path defined | [SECURITY.md](../SECURITY.md) | [x] |

**Section status: RED** — 8.1, 8.3 pending

---

## 9. Go / No-Go Memo

The final mainnet Go/No-Go memo must answer:

- [ ] What is green
- [ ] What risks remain
- [ ] What is accepted
- [ ] What is deferred
- [ ] Why mainnet is justified now

Template: [GO-NO-GO.md](./GO-NO-GO.md) (current: testnet beta freeze decision)

**Section status: RED** — not yet written for mainnet

---

## Hard Stop Blockers

Any of these is an absolute blocker — no exceptions:

| Blocker | Current Status |
|---------|---------------|
| Unresolved serious security finding | None known |
| Any red quality gate | All green |
| Docs/spec drift in canonical materials | All synced (CI-enforced) |
| Unstable bot/API operational path | Stable on testnet |
| No multisig / weak key management | **BLOCKER** — single EOA |
| No successful deployment rehearsal | **BLOCKER** — not yet done |

---

## Recommended (Not Required)

| # | Criterion | Status |
|---|-----------|--------|
| R-1 | Formal verification of dividend invariants (Certora/Halmos) | [ ] |
| R-2 | Load testing (100+ concurrent users simulated) | [ ] |
| R-3 | Cross-browser E2E tests (Firefox, Safari) | [ ] |
| R-4 | Gas optimization review (< 100k gas for common ops) | [ ] |
| R-5 | Chainlink Keepers for automated recycling | [ ] |
| R-6 | Bug bounty program (Immunefi) | [ ] |

---

## Shortest Path from Current State

| Step | What | Status |
|------|------|--------|
| 1 | External audit pack | **DONE** — [AUDIT-PACK.md](./AUDIT-PACK.md) |
| 2 | Controlled real-user beta | Pending |
| 3 | Deployment + incident rehearsal | Pending |
| 4 | Governance finalization (multisig) | Pending |
| 5 | Formal go/no-go memo | Pending |

---

## Decision Framework

```
All 9 sections GREEN  →  GO for mainnet
Any section RED       →  NO-GO until blocking section is closed
```

---

*Last updated: 2026-03-10*
