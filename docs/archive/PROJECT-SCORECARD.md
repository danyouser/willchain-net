# WillChain — Детальна Оцінка Проекту (Scorecard)

**Дата:** 2026-03-07 (оновлено після сесій 1–11)
**Методологія:** Оцінка кожної категорії від 1 до 10, з вагою. Зважена підсумкова оцінка.

---

## Підсумок

| Категорія | Оцінка | Вага | Зважена |
|-----------|--------|------|---------|
| 1. Смарт-контракт (Security & Logic) | **9.5/10** | 25% | 2.375 |
| 2. Тестове покриття | **9.4/10** | 15% | 1.410 |
| 3. Frontend (UX/UI) | **8.2/10** | 15% | 1.230 |
| 4. Telegram Bot | **8.5/10** | 10% | 0.850 |
| 5. Документація | **8.0/10** | 10% | 0.800 |
| 6. DevOps & CI/CD | **8.0/10** | 5% | 0.400 |
| 7. Брендинг & Консистентність | **9.0/10** | 5% | 0.450 |
| 8. Токеноміка & Бізнес-модель | **8.5/10** | 10% | 0.850 |
| 9. Юридична готовність | **5.0/10** | 5% | 0.250 |
| **ЗАГАЛЬНА ОЦІНКА** | | | **8.62 / 10** |

---

## Детальний розбір кожної категорії

---

### 1. Смарт-контракт — 9.5/10 ⭐⭐⭐⭐⭐

**Що ідеально (9–10):**
- Один файл — ідеальна стислість, легко аудитувати
- OpenZeppelin v5: ERC20, ERC20Burnable, ReentrancyGuard, **Ownable2Step**
- Pinned Solidity `0.8.24` (не `^0.8.20`)
- Optimizer enabled + viaIR
- Dividend accumulator — O(1), математично коректний
- Per-user flashloan protection (`lastTransferBlock`) — у всіх write operations
- 2-step treasury timelock (propose → 2 days → execute / cancel)
- `TreasuryChangeCancelled` event при скасуванні pending proposal
- `renounceOwnership()` disabled
- Circular successor guard (A→B + B→A → revert)
- `designateSuccessor` блокує `address(this)` як successor
- `updateVaultData(bytes32(0))` заблоковано
- Comprehensive NatSpec: `@author`, `@custom:security-contact`, struct fields, internal functions
- State machine чітко визначена: UNREGISTERED → ACTIVE → GRACE → CLAIMABLE → ABANDONED
- `getNodeState().isActive` = false для UNREGISTERED (коректна семантика)
- Events: `NodeRegistered`, `FrozenDividendsRecovered`, `DividendsBurnedNoEligibleHolders`, `DividendDustRecovered`
- 52 findings знайдено та виправлено протягом 8 аудит-ітерацій

**Що не ідеально (-0.5):**
- Немає **формальної верифікації** (Certora/Halmos) — для Tier-1 обов'язково
- `transferFrom()` allowance дозволяє зовнішнім dApp знімати без activity confirmation (documented trade-off T1)

**Як вдосконалити:**
```
□ Запустити Certora Prover для dividend invariants
□ Написати Echidna invariant: dividendPool >= Σ(unclaimedDividends)
```

---

### 2. Тестове покриття — 9.4/10 ⭐⭐⭐⭐½

**Поточний стан (227 Hardhat + 95 Bot + 89 Shared = 411 тести):**

| Метрика | Значення |
|---------|----------|
| Statements | **95.91%** |
| Branches | **90.00%** |
| Functions | **100%** |
| Lines | **97.39%** |
| Hardhat tests | **227 passing** |
| Bot tests | **95 passing** |
| Shared/Node tests | **89 passing** |

**Що ідеально:**
- `assertUnregInvariant` helper для перевірки state consistency
- Adversarial тести: flashloan, circular successor, self-recycle, resurrection
- Treasury Timelock: 5 тестів (propose, execute-early, execute-after, cancel, access)
- UNREGISTERED exclusion: 6 тестів (invariant, confirmActivity, zero dividends, 100% for registered)
- Accounting invariants: 9 тестів (S1, S3, S5, S6, S8, dividend accounting, BPS sum, boundary)
- `recoverDividendDust` event emission test
- Semantic regression: `test/vault-status.test.js` (25 тестів), `vaultStatus.test.ts` (11 Vitest)
- i18n completeness: `i18n.test.js` (10 мов × 2 перевірки)
- i18n usage: `i18n-unused.test.js` (3 тести, перевіряє React TSX)
- CI coverage threshold: Branches ≥ 88%, Statements ≥ 94%

**Що не ідеально (-0.6):**
- **Branches 90%** — є неперевірені гілки (бажано 95%+)
- Немає **fuzz testing** (Foundry/Echidna)
- Немає **E2E тестів** для frontend (Playwright/Cypress)

**Як вдосконалити:**
```
□ Foundry fuzz: totalUnregisteredSupply invariant + dividend accumulator edge cases
□ Playwright: connect wallet → confirmActivity → designateSuccessor happy path
□ Підняти branch coverage до 95%+
```

---

### 3. Frontend (React) — 8.2/10 ⭐⭐⭐⭐

**Що добре:**
- React + Vite + TypeScript — сучасний стек
- RainbowKit + wagmi (EIP-6963, WalletConnect)
- `useSimulatedWrite` — simulate before send (запобігає failed transactions)
- 11 мов i18n — `useTranslation()` у всіх компонентах
- `ErrorBoundary` компонент обгортає Dashboard
- Dashboard loading skeleton (3 картки з `opacity: 0.5`)
- Heartbeat UI в TimeCard: SVG кільце + pulse animation (calm/warning/critical)
- `useChainGuard` — перевірка chain перед будь-яким write
- Confirmation modal для деструктивних операцій (recycle, claim)
- Smart wallet detection + попередження
- SuccessorCard: inline validation (zero address, self-address)
- `GRACE_PERIOD_SECONDS` + `CLAIM_PERIOD_SECONDS` — іменовані константи (не hardcoded)
- Auto-refresh polling кожні 30 секунд
- VaultDataCard показує поточний vaultDataHash
- IncomingInheritancesCard, DividendsCard, Timeline — повний feature parity
- 10 Dashboard cards, 6 sections, DisclaimerModal, TgLinkModal
- Allowance warning banner у TransferModal (`activity_reset_hint`, всі 11 мов)
- `manualChunks`: react-vendor, wagmi-vendor, rainbowkit, i18n — без chunk size warnings
- `WILLCHAIN_ABI` — повністю перейменовано з `PHOENIX_LEGACY_ABI`

**Що не ідеально (-1.8):**

| Проблема | Серйозність | Як вдосконалити |
|----------|-------------|-----------------|
| Немає **loading skeletons** з shimmer анімацією (тільки opacity) | 🟢 Low | CSS shimmer skeleton для кожного card |
| Немає **PWA** (manifest.json, service-worker) | 🟡 Medium | `vite-plugin-pwa` — 30 хв роботи |
| Один великий CSS файл (~2100 рядків) | 🟢 Low | CSS Modules або розбити на тематичні файли |
| Немає **E2E тестів** для frontend | 🟡 Medium | Playwright happy path |
| `wagmi.ts` hardcoded на `baseSepolia` | 🟡 Medium | `VITE_CHAIN=mainnet\|testnet` env variable |

---

### 4. Telegram Bot — 8.5/10 ⭐⭐⭐⭐

**Що добре:**
- EIP-712 challenge-response для верифікації гаманця (`/link`)
- SQLite persistent database (БД survive restarts)
- Rate limiter: **persistent SQLite** `rate_limits` таблиця + 5-хв cleanup interval
- 24-hour cooldown на `/link`
- Active RPC health check: `provider.getBlockNumber()` у `/health`
- Event listeners: SuccessorDesignated, SuccessorClaimInitiated, VaultAccessTransferred, UserActivityConfirmed, NodeRegistered
- Email notifications (Resend): 5 шаблонів, WillChain branding
- Event catch-up mechanism (missed events)
- Explorer link у `/status` відповіді
- Graceful shutdown (SIGINT, SIGTERM)
- Address normalization у `/successors/:addr` (case-insensitive)
- Link challenge TTL: `<=` (off-by-one виправлено)
- Structured logging: `LOG_FORMAT=json` → JSON lines; else emoji-prefixed human-readable
- 95 bot tests passing

**Що не ідеально (-1.5):**

| Проблема | Як вдосконалити |
|----------|-----------------|
| `index.js` — 1077 рядків, монолітний файл | Розбити: commands.js, events.js, cron.js, notifications.js |
| Немає retry logic для RPC calls | Exponential backoff при RPC помилках |
| Немає Docker | Dockerfile + docker-compose для bot + SQLite |

---

### 5. Документація — 8.0/10 ⭐⭐⭐⭐

**Що добре:**
- 20+ документів у `docs/`
- `PROTOCOL-TRUTH.md` — єдиний канонічний reference (~380 рядків, 11 секцій)
- `ASSUMPTIONS-AND-GUARANTEES.md` — інституційний governance doc (G1–G14, N1–N10, A1–A8)
- `WHITEPAPER.md` — 553 рядків, v3.0, детальне порівняння з аналогами
- `AUDIT-GUIDE.md` — state machine, invariants, critical functions для зовнішніх аудиторів
- `DIVIDEND-MATH.md` — математична верифікація (Synthetix accumulator model)
- `SECURITY.md` — responsible disclosure policy
- `MAINNET_CHECKLIST.md` — actionable checklist
- `RUNBOOK.md` — operational runbook (deploy, healthcheck, incident response)
- `PROFESSIONAL-AUDIT.md` — повний аудит-звіт (52 findings)
- `README.md` — корінь проекту, architecture overview, quickstart
- `CHANGELOG.md` — ведеться від v0.7.0

**Що не ідеально (-2.0):**

| Проблема | Серйозність | Як вдосконалити |
|----------|-------------|-----------------|
| Немає **стабільної versioned spec** (тільки "Unreleased") | 🟡 Medium | Тегувати релізи v1.0 після mainnet |
| `CLAUDE-CONTEXT.md` — внутрішній AI context (в .gitignore, але є в репо) | 🟢 Low | Видалити з репо |
| Немає **API документації** для bot HTTP endpoints | 🟢 Low | OpenAPI spec для `/health`, `/successors`, `/verify-link` |

---

### 6. DevOps & CI/CD — 8.0/10 ⭐⭐⭐⭐

**Що добре:**
- GitHub Actions CI: 5 jobs (contract, react, bot, shared-tests, config-drift)
- **Slither** static analysis job у CI ✅
- `npm audit --audit-level=high` у всіх jobs ✅
- Config-drift checks: eip712.js chainId, contract-config.js address ✅
- Coverage thresholds: Branches ≥ 88%, Statements ≥ 94% ✅
- Stale branding check: rejects `phoenix.legacy|PHOENIX_LEGACY|ImAlive` ✅
- `PROTOCOL-TRUTH.md` + `README.md` existence gates ✅
- Gas snapshot в CI → appended to GitHub Actions step summary ✅
- `.env.example` з детальними коментарями (`DEPLOYMENT_BLOCK` REQUIRED warning)
- Deploy script з safety checks (blocks mainnet без `TREASURY_ADDRESS`)
- Deployment artifacts зберігаються з timestamp
- Bot tests у CI

**Що не ідеально (-2.0):**

| Проблема | Як вдосконалити |
|----------|-----------------|
| Немає **Docker** для бота | Dockerfile + docker-compose |
| Немає **monitoring** (UptimeRobot, Grafana) | Хоча б UptimeRobot для `/health` |
| Немає **pre-commit hooks** | husky + prettier + solhint |
| Немає **staging** auto-deploy | Auto-deploy до Base Sepolia на push до `dev` |

---

### 7. Брендинг & Консистентність — 9.0/10 ⭐⭐⭐⭐½

**Що добре:**
- Контракт, deploy, фронтенд, бот — скрізь "WillChain" / "WILL" ✓
- `WILLCHAIN_ABI` — перейменовано з `PHOENIX_LEGACY_ABI` у 34 місцях ✓
- Домен willchain.net ✓
- Emails: WillChain branding ✓
- Bot `/status`: "WillChain" ✓
- `.env.example`, `RUNBOOK.md`: willchain.net ✓
- CI стежить за стейл брендингом (phoenix.legacy, PHOENIX_LEGACY, ImAlive) ✓
- `package-lock.json` name: willchain ✓
- `BalanceCard.tsx`: logo.svg (не phoenix-logo.svg) ✓

**Що не ідеально (-1.0):**

| Проблема | Кількість | Як вдосконалити |
|----------|-----------|-----------------|
| `deployments/*` — PhoenixLegacy у filename/content | 5+ файлів | Перегенеруються при наступному deploy |
| `CLAUDE-CONTEXT.md` у `.gitignore` але файл існує | 1 | Видалити з трекінгу git |

---

### 8. Токеноміка & Бізнес-модель — 8.5/10 ⭐⭐⭐⭐

**Що ідеально:**
- Deflationary model: 47% burn на recycle = постійне скорочення supply
- Dividend yield: 47% в pool для active holders
- Калібровані % (BPS sum = 10000, верифіковано тестом)
- 4 рівня Service Tiers (1K, 10K, 100K WILL)
- Гнучкі inactivity periods (30/90/180/365 days)
- 1% maintainer reward = децентралізований стимул для recycling
- `FrozenDividendsRecovered` — відморожені дивіденди покинутих вузлів повертаються в pool

**Що не ідеально (-1.5):**

| Проблема | Як вдосконалити |
|----------|-----------------|
| Немає публічного token distribution plan | Team/treasury/liquidity/public % |
| Немає liquidity strategy (AMM, DEX) | Uniswap v3 на Base |
| CEX-проблема: біржа ніколи не "вмре" | v2: staked/vaulted model |
| Немає vesting для team tokens | Hedgey або Sablier |

---

### 9. Юридична готовність — 5.0/10 ⭐⭐½

**Що є:**
- MIT License ✓
- SECURITY.md з responsible disclosure ✓
- Disclaimer section у frontend ✓
- DisclaimerModal з checkbox (потрібне підтвердження перед підключенням) ✓

**Що відсутнє (-5.0):**

| Проблема | Як вдосконалити |
|----------|-----------------|
| Немає **Terms of Service** | willchain.net/terms |
| Немає **Privacy Policy** | Обов'язково — бот зберігає Telegram ID + wallet address (GDPR) |
| Немає **юридичного opinion** (security vs utility token) | Криптоюрист |
| Немає **cookie/tracking consent** | Якщо є analytics |
| Немає **DeFi risk disclosure** у Disclaimer | Додати ризики смарт-контрактів, волатильності |

---

## Візуальна діаграма оцінок

```
  Смарт-контракт  ██████████████████████████████████████████████████ 9.5
  Тести           ████████████████████████████████████████████████▌  9.4
  Токеноміка      ███████████████████████████████████████████        8.5
  Telegram Bot    ███████████████████████████████████████████        8.5
  Брендинг        █████████████████████████████████████████████      9.0
  Frontend (UX)   █████████████████████████████████████████          8.2
  DevOps/CI       ████████████████████████████████████████           8.0
  Документація    ████████████████████████████████████████           8.0
  Юридичне        █████████████████████████                          5.0
                  ├────────────────────────────────────────────────┤
                  0    1    2    3    4    5    6    7    8    9   10
```

---

## Залишилось для підняття оцінки

| # | Дія | Час | Підніме |
|---|-----|-----|---------|
| 1 | ~~Rename `PHOENIX_LEGACY_ABI` → `WILLCHAIN_ABI`~~ | ✅ | Брендинг ↑ |
| 2 | ~~Створити `README.md`~~ | ✅ | Документація ↑ |
| 3 | ~~Видалити `SECURITY-ANALYSIS.md`~~ | ✅ | Docs ↑ |
| 4 | ~~`PROTOCOL-TRUTH.md` + `ASSUMPTIONS-AND-GUARANTEES.md`~~ | ✅ | Документація 7.5→8.0 |
| 5 | ~~Gas snapshot в CI~~ | ✅ | DevOps +0.3 |
| 6 | ~~`CHANGELOG.md`~~ | ✅ | DevOps/Docs ↑ |
| 7 | **Додати Privacy Policy + Terms of Service** | 2 год | Юридичне 5→7 |
| 8 | **Розбити `bot/src/index.js`** (1077 рядків) на commands/events/cron | 2 год | Bot 8.5→9 |
| 9 | **PWA manifest** (`vite-plugin-pwa`) + **shimmer skeletons** | 1 год | Frontend 8.2→8.7 |
| 10 | **Playwright E2E тест** happy path (wallet → confirm → designate) | 3 год | Тести 9.4→9.6 |
| 11 | **Docker** для бота | 1 год | DevOps +0.5 |
| 12 | **Token Distribution публічний документ** | 1 год | Токеноміка 8.5→9 |

**Якщо зробити пп. 7–12 → загальна оцінка: 8.62 → ~9.2/10** 🚀

---

## Що зроблено (сесії 1–11)

| # | Виправлення | Сесія |
|---|-------------|-------|
| ✅ | Hardhat тести: 161 → 227, Bot: 90 → 95, Shared: 70 → 89 (разом 411) | 1–11 |
| ✅ | Branch coverage: 87.5% → 90%, Statements: 93.9% → 95.9% | 8 |
| ✅ | CI coverage thresholds (Branches ≥ 88%, Statements ≥ 94%) | 11 |
| ✅ | Accounting invariant tests (9 тестів: S1, S3, S5, S6, S8, BPS, boundary) | 11 |
| ✅ | PROTOCOL-TRUTH.md (canonical protocol spec, 11 секцій) | 11 |
| ✅ | ASSUMPTIONS-AND-GUARANTEES.md (G1–G14, N1–N10, A1–A8) | 11 |
| ✅ | Structured JSON logging у bot (LOG_FORMAT=json) | 11 |
| ✅ | Allowance warning banner у TransferModal (11 мов) | 11 |
| ✅ | vite.config.ts manualChunks — без chunk size warnings | 11 |
| ✅ | Gas snapshot в CI | 11 |
| ✅ | CHANGELOG.md | 11 |
| ✅ | Loading skeleton у Dashboard | 9 |
| ✅ | Heartbeat UI у TimeCard (SVG ring, pulse animation) | 9 |
| ✅ | ErrorBoundary + DisclaimerModal + TgLinkModal у React | 9 |
| ✅ | Slither у CI | 9 |
| ✅ | npm audit у всіх CI jobs | 9 |
| ✅ | Rate limiter persistent SQLite (замість in-memory Map) | 9 |
| ✅ | Active RPC health check у `/health` (getBlockNumber) | 9 |
| ✅ | i18n.test.js + i18n-unused.test.js: виправлені після міграції lang/ | 11 |
| ✅ | `PHOENIX_LEGACY_ABI` → `WILLCHAIN_ABI` (34 місця у frontend-react) | 11 |
| ✅ | `README.md` створено у корені проекту | 11 |
| ✅ | `SECURITY-ANALYSIS.md` видалено | 11 |
| ✅ | `CLAUDE-CONTEXT.md` в `.gitignore` | 11 |
| ✅ | `package-lock.json` name: phoenix-protocol → willchain | 11 |

---

## Порівняння з конкурентами

| Критерій | WillChain | SafeHaven | Inheriti | DigiWill |
|----------|-----------|-----------|----------|----------|
| On-chain (no oracle) | ✅ | ❌ оракул | ❌ keeper | ❌ backend |
| Single contract | ✅ | ❌ multi | ❌ multi | ❌ |
| Dividend yield | ✅ 47% | ❌ | ❌ | ❌ |
| Deflationary | ✅ 47% burn | ❌ | ❌ | ❌ |
| Audit depth | ✅ 52 findings | ? | ? | ? |
| Multi-lang | ✅ 11 мов | ❌ | ❌ | ❌ |
| Telegram bot | ✅ EIP-712 | ❌ | ❌ | ❌ |
| Smart wallet support | ✅ Ownable2Step | ? | ? | ? |
| Static analysis (CI) | ✅ Slither | ? | ❌ | ❌ |
| Canonical spec | ✅ PROTOCOL-TRUTH.md | ❌ | ❌ | ? |
| Gas snapshot CI | ✅ | ❌ | ❌ | ❌ |
| Structured logging | ✅ JSON/human | ❌ | ❌ | ❌ |
| Privacy Policy | ❌ | ✅ | ✅ | ✅ |
| Formal verification | ❌ | ❌ | ❌ | ❌ |

**WillChain лідирує за технічною досконалістю, але відстає у legal compliance.**

---

*Загальна оцінка: **8.62/10** (попередня: 8.45/10 → +0.17)*
*Наступна ціль: 9.0/10 через залишені дії вище.*
