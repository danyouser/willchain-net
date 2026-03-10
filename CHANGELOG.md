# Changelog

All notable changes to WillChain are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `PROTOCOL-TRUTH.md` — single canonical reference for all protocol behavior (supersedes PROTOCOL-SPEC.md, SECURITY-MODEL.md for protocol facts)
- `ASSUMPTIONS-AND-GUARANTEES.md` — institutional-grade governance document (G1–G14 guarantees, N1–N10 non-guarantees, A1–A8 operator assumptions, change management policy, pre-mainnet checklist)
- 9 new accounting invariant tests: S1 (dividendPool ≥ 0), S3 (totalRemovedFromCirculation monotonic), S5 (initiateSuccessorClaim blocked on ABANDONED), S6 (blocked on UNREGISTERED), S8 (circular successor), dividend accounting, BPS sum, boundary conditions
- Structured JSON logging in bot (`LOG_FORMAT=json` → JSON lines; else emoji-prefixed human-readable)
- Allowance warning banner in `TransferModal` with `activity_reset_hint` key in all 11 languages
- `vite.config.ts` `manualChunks`: react-vendor, wagmi-vendor, rainbowkit, i18n separate bundles — eliminates chunk size warnings
- `hardhat-gas-reporter` enabled in CI via `REPORT_GAS=true` — gas usage appended to GitHub Actions step summary
- Gas snapshot step in CI (`contract` job)
- Coverage thresholds enforced in CI: Branches ≥ 88%, Statements ≥ 94%
- Stale branding check in CI (`config-drift` job): rejects `phoenix.legacy|PHOENIX_LEGACY|ImAlive` in source
- `PROTOCOL-TRUTH.md` and `README.md` existence gates in CI
- `README.md` at project root with architecture overview, quickstart, security section

### Changed
- `PHOENIX_LEGACY_ABI` → `WILLCHAIN_ABI` in `contract.ts` and all 13 importing files
- `BalanceCard.tsx`: `phoenix-logo.svg` → `logo.svg`
- `package-lock.json` name: `phoenix-protocol` → `willchain`
- `docs/CLAUDE-CONTEXT.md` added to `.gitignore`
- `test/i18n.test.js` LANG_DIR path: `frontend/lang` → `lang/` (root)
- `test/i18n-unused.test.js`: removed 4 Telegram modal keys from `KNOWN_ORPHANED_KEYS` (they are actively used in `TgLinkModal.tsx`)
- Hardhat tests: 218 → **227 passing**

### Removed
- `docs/SECURITY-ANALYSIS.md` (stale Phoenix Protocol references; superseded by `PROFESSIONAL-AUDIT.md`)

---

## [0.9.0] — 2026-03-06

### Added
- EIP-712 wallet linking (`/link` command) with challenge-response signature verification
- `bot/src/eip712.js` — `verifyWalletLinkSignature(address, telegramId, nonce, sig)`
- `TgLinkModal.tsx` — frontend modal for EIP-712 signing flow
- SQLite persistent `rate_limits` table (survives bot restarts)
- 24-hour cooldown on `/link` command
- Active RPC health check in `/health` (`provider.getBlockNumber()`)
- `vaultStatus.test.ts` — 11 Vitest semantic regression tests for React vault status logic
- `test/vault-status.test.js` — 25 Node.js semantic regression tests for shared `deriveVaultStatus()`
- `test/i18n-unused.test.js` — detects unused i18n keys in React TSX sources
- `ErrorBoundary` component wrapping `Dashboard`
- Dashboard loading skeleton (3 cards with `opacity: 0.5`)
- Heartbeat UI in `TimeCard`: SVG ring + pulse animation (calm / warning / critical states)
- `useChainGuard` hook — verifies correct chain before any write operation
- Smart wallet detection and warning in frontend
- Confirmation modal for destructive operations (recycle, claim)
- `IncomingInheritancesCard`, `DividendsCard`, `Timeline` — full feature parity

### Changed
- `globalLastTransferBlock` → per-user `lastTransferBlock[address]` (audit fix)
- Removed `tx.origin` guard — Smart Wallets (Safe, ERC-4337) now supported
- `setInactivityPeriod`, `designateSuccessor`, `updateVaultData`, `cancelSuccessorClaim` all call `_performActivityConfirmation` (audit fix: "self-suicide" bug)
- `initiateSuccessorClaim` on ABANDONED vault: blocked with upper bound (audit fix)
- `lang/` directory moved from `frontend/lang/` to project root
- `frontend-react/` is now the canonical frontend; `frontend/` is DEPRECATED

### Fixed
- Bot `index.js`: false "transfer to activate" message → "call confirmActivity()"
- `useIsSmartWallet.ts`: lint — async pattern without sync setState in effect
- `ClaimVaultCard` / `RecycleNodeCard`: `isActive` semantics → explicit timestamp checks
- EIP-712 challenge TTL check: `<` → `<=` (off-by-one fix)

---

## [0.8.0] — 2026-02-27

### Added
- Slither static analysis in CI (`--fail-medium`)
- `npm audit --audit-level=high` in all CI jobs
- `UNREGISTERED` state: `totalUnregisteredSupply` + `everRegistered` mechanism
- 6 UNREGISTERED dividend exclusion tests
- 5 Treasury Timelock tests (propose, execute-early, execute-after, cancel, access)
- `assertUnregInvariant` helper for state consistency verification
- `FrozenDividendsRecovered` event on recycling when abandoned node had unclaimed dividends
- `DividendsBurnedNoEligibleHolders` event when eligibleSupply == 0
- `DividendDustRecovered` event in `recoverDividendDust()`
- `TreasuryChangeProposed` event in `proposeTreasuryChange()`
- `TreasuryChangeCancelled` event when overwriting a pending treasury proposal
- 2-day treasury timelock: `proposeTreasuryChange` → `executeTreasuryChange` / `cancelTreasuryChange`
- NatSpec for `NodeState` struct fields and `_performActivityConfirmation` / `_addToDividendPool`
- Config-drift checks in CI: contract address, chain ID, localhost URLs, EIP-712 chain ID

### Changed
- `setProtocolTreasury()` replaced by three-function timelock flow
- Hardhat tests: 161 → 207 passing
- Bot tests: 90 passing
- Shared tests: 70 → 89 passing

### Fixed
- 52 audit findings across 8 audit iterations (see `docs/PROFESSIONAL-AUDIT.md`)
- `renounceOwnership()` permanently disabled (overridden to revert)
- Circular successor chains rejected on-chain (`A→B + B→A` → revert)
- Contract address blocked as treasury or successor

---

## [0.7.0] — 2026-02-20

### Added
- Initial WillChain protocol (rebrand from ImAlive.io)
- State machine: UNREGISTERED → ACTIVE → GRACE → CLAIMABLE → ABANDONED
- Synthetix-style O(1) dividend accumulator
- `Ownable2Step` (2-step ownership transfer)
- Telegram bot with Grammy + SQLite
- React frontend with RainbowKit + wagmi
- 11-language i18n support
- Deploy scripts for Base Sepolia

---

*Contract address (Base Sepolia): `0x6fAd1475B41731E3eDA21998417Cb2e18E795877`*
*See `docs/PROTOCOL-TRUTH.md` for canonical protocol specification.*
