# Protocol Change Doctrine

Internal rulebook for managing changes to the WillChain protocol.
Follow this for every change to contract, frontend, bot, or docs.

---

## Change Categories

### Category A — Protocol-Breaking (requires full QA + docs update)

Changes that alter protocol behavior, state transitions, or economic model:

- Any modification to `WillChain.sol` (logic, constants, storage layout)
- Changes to VaultStatus enum or transition rules
- Modifications to recycling distribution (burn/dividend/fee ratios)
- Timer constant changes (GRACE_PERIOD, CLAIM_PERIOD, inactivity periods)
- Dividend calculation logic changes
- Adding/removing onlyOwner functions

**Required:**
1. Update `docs/PROTOCOL-SPEC.md` and `docs/PROTOCOL-TRUTH.md`
2. Update `docs/INVARIANTS.md` if invariants affected
3. Update `shared/fixtures/canonical-states.json` if states/transitions changed
4. Run full QA: `npm run qa`
5. Run Foundry fuzz: `forge test --match-contract WillChainFuzz`
6. Regenerate: `node scripts/generate-docs.js`
7. Update `docs/GENERATED-REFERENCE.md`
8. PR review required

### Category B — Interface Changes (requires ABI + frontend sync)

Changes that modify the contract's external interface:

- Adding/removing/renaming public/external functions
- Changing function signatures or return types
- Adding/removing events
- Adding/removing public state variables

**Required:**
1. Update `frontend-react/src/config/contract.ts` (ABI)
2. Update `shared/contract-config.js` if applicable
3. Update bot ABI entries in `bot/src/index.js`
4. Run `test/ci-assertions.test.js` to verify ABI consistency
5. Run frontend tests: `cd frontend-react && npm test`

### Category C — Frontend UX Changes

Changes to user-facing UI behavior:

- Adding/removing dashboard components
- Changing CTA gating logic
- Modifying status badge conditions
- Changing notification messages

**Required:**
1. Update relevant frontend tests (`dashboard.test.tsx`, `ctaGating.test.tsx`, `successorCard.test.tsx`)
2. Run lint: `cd frontend-react && npm run lint`
3. Verify build: `cd frontend-react && npm run build`
4. Update i18n keys if any added/removed: `npm run translate`
5. Run i18n unused test: `node --test test/i18n-unused.test.js`

### Category D — Bot/Ops Changes

Changes to alerting, monitoring, or operational behavior:

- Cron schedule changes
- Alert threshold changes
- API endpoint changes
- Database schema changes

**Required:**
1. Run bot tests: `cd bot && npm test`
2. Update `docs/API.md` if API changed
3. Update `docs/BOT-DEPLOY.md` if deployment affected
4. Update `bot/.env.example` if new env vars

### Category E — Documentation Only

Changes that don't affect code behavior:

- Typo fixes, clarifications, new explanatory docs
- README updates, whitepaper edits

**Required:**
1. Run `test/ci-assertions.test.js` to verify no drift introduced
2. No code review required for typo fixes

---

## Pre-Merge Checklist

For any PR, verify:

- [ ] `npm run qa` passes (compile + test + lint + build)
- [ ] No new CI assertion failures
- [ ] Constants in docs match contract values
- [ ] No stale branding (Phoenix, ImAlive, ALIVE)
- [ ] i18n keys balanced (no orphans)

---

## Post-Deploy Checklist (Testnet)

After deploying contract changes:

- [ ] Verify contract on explorer
- [ ] Update `CONTRACT_ADDRESS` in all config files
- [ ] Test bot sync with new contract
- [ ] Smoke test frontend against new deployment
- [ ] Run `node scripts/generate-docs.js` with production ABI

---

## Breaking Change Protocol

If a change is protocol-breaking (Category A):

1. **Announce** in team channel before starting work
2. **Branch** from `dev`, never direct to `main`
3. **Test** with full Foundry fuzz suite (10,000 runs minimum)
4. **Review** — minimum 2 reviewers for contract changes
5. **Document** — all affected docs updated in same PR
6. **Deploy** — testnet first, verify, then mainnet (after external audit)

---

## Versioning

- Contract changes: bump version in `package.json`
- ABI changes: regenerate `docs/GENERATED-REFERENCE.md`
- Each release: tag with `git tag v<version>`
- Keep `CHANGELOG.md` updated (create when first mainnet release)
