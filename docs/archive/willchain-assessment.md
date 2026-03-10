# WillChain — Експертна Оцінка Проекту

## Загальний вердикт: 87/100 🏆

**WillChain** — це рідкісний випадок DeFi-проекту, де архітектурні рішення прийняті правильно з першого разу, а вразливості знайдені й виправлені ДО запуску. Контракт простий (один файл, ~786 рядків), математично коректний, і не має жодної залежності за межами OpenZeppelin.

Для порівняння: більшість "Dead Man's Switch" та inheritance-протоколів, що існують (Soulbound, DigiWill, SafeHaven, Inheriti), мають складну мульти-контрактну архітектуру з оракулами, проксі та централізованими точками довіри. WillChain обходиться без цього.

---

## I. СМАРТ-КОНТРАКТ — 91/100

### ✅ Що зроблено бездоганно

| Аспект | Оцінка | Деталі |
|--------|--------|--------|
| **Dividend math** | 10/10 | Synthetix per-token accumulator з O(1) складністю. Бездоганна реалізація. |
| **State machine** | 10/10 | UNREGISTERED→ACTIVE→GRACE→CLAIMABLE→ABANDONED — чітко визначені переходи, жодних двозначностей. |
| **Flashloan protection** | 9/10 | Per-user `lastTransferBlock` на всіх трьох критичних функціях (recycle, claim, transfer). |
| **Unregistered isolation** | 10/10 | `totalUnregisteredSupply` + `everRegistered` — убивчий захист від free-rider атак. |
| **Treasury timelock** | 10/10 | 2-day propose → execute → cancel — золотий стандарт для admin-функцій. |
| **Ownership** | 10/10 | `Ownable2Step` — 2-step transfer, помилковий трансфер неможливий. |
| **Reentrancy** | 9/10 | `nonReentrant` на `recycleInactiveNode`, `claimDividends`, `completeVaultTransfer`. |
| **Circular successor** | 8/10 | Пряма перевірка (A→B, B→A). Транзитивні ланки (A→B→C→A) не перевіряються — задокументовано. |
| **NatSpec / Comments** | 9/10 | Кожна функція задокументована, struct-поля з `@dev`, покращений `_addToDividendPool`. |
| **Event coverage** | 9/10 | 16 events покривають всі значущі стани. `NodeRegistered`, `FrozenDividendsRecovered`, `DividendsBurnedNoEligibleHolders` — все є. |

### ⚠️ Що потрібно доробити (для 99.99%)

#### 1. 🔴 `_update` hook: мертвий код (рядки 698-701)

```solidity
if (to != address(0) && to != address(this) && balanceOf(to) == value) {
    lastDividendPerToken[to] = dividendPerToken;
}
```

Цей блок — **функціонально надлишковий**:
- Для ЗАРЕЄСТРОВАНИХ: `_updateDividends(to)` (рядок 681) вже встановлює `lastDividendPerToken[to] = dividendPerToken`
- Для НЕЗАРЕЄСТРОВАНИХ: `_performActivityConfirmation` при реєстрації теж це робить

**Наслідок**: цей код створює ілюзію, що без нього щось зламається. Зовнішні аудитори витратять години, намагаючись зрозуміти чи є edge case, де він потрібен. Рекомендую або видалити, або додати коментар `// DEFENSE-IN-DEPTH: redundant safety net`.

#### 2. 🟡 Gas optimization в `_performActivityConfirmation`

Кожен ERC-20 `transfer()` зареєстрованого юзера записує 3 storage slots:
```solidity
nodeStates[node].lastActivityTimestamp    = block.timestamp;  // потрібно
nodeStates[node].successorClaimInitiated  = false;            // зазвичай вже false
nodeStates[node].claimInitiationTimestamp = 0;                // зазвичай вже 0
```

Оптимізація:
```solidity
nodeStates[node].lastActivityTimestamp = block.timestamp;
if (nodeStates[node].successorClaimInitiated) {
    nodeStates[node].successorClaimInitiated = false;
    nodeStates[node].claimInitiationTimestamp = 0;
}
```
**Економія: ~5,800 gas на кожен transfer** (99.9% трансферів не мають pending claim).

#### 3. 🟡 Відсутній `@author` та `@custom:security-contact`

Для верифікованого контракту на Basescan:
```solidity
/// @title WillChain (WILL)
/// @author WillChain Team
/// @custom:security-contact security@willchain.net
```

#### 4. 🟢 `pragma solidity 0.8.24` ✅ Вже виправлено.

---

## II. ТЕСТОВИЙ SUITE — 88/100

**153+ тестів**, включаючи:
- Adversarial scenarios (flashloan, circular successor, race conditions)
- Boundary tests (exact timestamps, 1 wei balance)
- Invariant check (`assertUnregInvariant`)
- Defensive branch coverage (`forceZeroTreasury` через `hardhat_setStorageAt`)

### Що потрібно:

| Тест | Статус |
|------|--------|
| `DividendsBurnedNoEligibleHolders` event | ❌ Не покритий |
| `FrozenDividendsRecovered` event args | ❌ Не перевіряються |
| `DividendDustRecovered` event args | ❌ Не перевіряються |
| `NodeRegistered` event | ❌ Не покритий |
| `TreasuryChangeCancelled` event | ❌ Не покритий |
| `completeVaultTransfer` flashloan guard | ❌ Новий require, тест відсутній |
| `Ownable2Step` — `acceptOwnership` flow | ❌ Не покритий |
| Recycled node re-registration + dividend isolation | ⚠️ Частково (Ghost Farming fix не перевірено повністю) |

> [!IMPORTANT]
> Я б рекомендував довести покриття **нових events** до 100% перед testnet. Це дає аудиторам впевненість, що events не мають побічних ефектів.

---

## III. ІНФРАСТРУКТУРА ТА ЕКОСИСТЕМА — 82/100

### Deploy script — ✅ ВИПРАВЛЕНО

`deploy.js` оновлено: використовує `proposeTreasuryChange()` + `executeTreasuryChange()` (2-day timelock). `setProtocolTreasury()` видалена з контракту і більше не викликається.

### Bot

| Аспект | Оцінка |
|--------|--------|
| Rate limiting | ✅ 10 cmd/min per user |
| EIP-712 wallet linking | ✅ Signature verification |
| Event catch-up | ✅ Batch query with pagination |
| Graceful shutdown | ✅ SIGINT + SIGTERM |
| **Бренд** | ⚠️ `Phoenix Protocol Bot` (рядок 982) — має бути `WillChain Bot` |

### Emails

| Проблема | Де |
|----------|-----|
| `ALIVE` замість `WILL` | [email.js:96](file:///Users/bohdanlukach/Sites/willchain.net/bot/src/email.js#L96) |
| `ImAlive` замість `WillChain` | email.js — subjects (рядки 33, 48, 63, 77, 91) |

### Документація

| Документ | Статус |
|----------|--------|
| [WHITEPAPER.md](file:///Users/bohdanlukach/Sites/willchain.net/docs/WHITEPAPER.md) | ⚠️ Повністю застарілий: каже `Phoenix Protocol`, `ALIVE`, `PhoenixLegacy.sol`, `Ownable`, `75 тестів`, старий код `_update` |
| HOW-IT-WORKS.md | ⚠️ Потребує ревізії на відповідність поточному контракту |
| SECURITY-MODEL.md | ⚠️ Не згадує `Ownable2Step`, `treasury timelock`, `everRegistered` |
| MAINNET_CHECKLIST.md | ⚠️ Посилається на `setProtocolTreasury`, не згадує нові fixes |

---

## IV. ПОРІВНЯННЯ З АНАЛОГАМИ

### Конкуренти в ніші "Crypto Inheritance / Dead Man's Switch"

| Проект | Підхід | Слабкість | WillChain перевага |
|--------|--------|-----------|-------------------|
| **SafeHaven (SHA)** | Через окремий ThorChain vault + оракул | Оракул = single point of failure | Жодних оракулів |
| **DigiWill** | Multi-sig + trusted backend | Централізований backend | 100% on-chain |
| **Inheriti (INH)** | NFT-based vault з Chainlink keeper | Складна мульти-контрактна архітектура, Chainlink dependency | 1 контракт, 786 рядків |
| **Soulbound/SBT** | Non-transferable tokens as identity | Не має inheritance mechanism | Повний inheritance flow |
| **Gnosis Safe Social Recovery** | Multi-sig + guardians | Потребує N guardians online | 1 successor, trustless |
| **WillChain** | On-chain Dead Man's Switch у самому ERC-20 | — | — |

### Унікальні переваги WillChain

1. **Proof of Activity вбудований у ERC-20 `_update`** — жоден конкурент не має автоматичного скидання таймера при свапах/трансферах
2. **Дивідендна модель** — 47% recycled токенів йдуть активним тримачам (створює сильний hold incentive)
3. **Дефляція** — 47% назавжди спалюється. Ніякого мінтингу. Supply тільки падає.
4. **Zero external dependencies** — жодних оракулів, keepers, off-chain cron jobs для core logic

---

## V. ЩО ПОТРІБНО ДЛЯ 99.99%

### Tier 1 — Обов'язково (блокери для testnet)

| # | Задача | Зусилля |
|---|--------|---------|
| 1 | **Виправити `deploy.js`** — видалити `setProtocolTreasury()`, додати інструкції для timelock | 15 хв |
| 2 | **Оновити `MAINNET_CHECKLIST.md`** — відобразити всі audit fixes | 30 хв |
| 3 | **Тести на нові events** (`NodeRegistered`, `TreasuryChangeCancelled`, `FrozenDividendsRecovered`, `DividendDustRecovered`, `DividendsBurnedNoEligibleHolders`) | 1 год |
| 4 | **Тест flashloan guard у `completeVaultTransfer`** | 20 хв |

### Tier 2 — Настійно рекомендується (для professional audit)

| # | Задача | Зусилля |
|---|--------|---------|
| 5 | **Gas optimization** `_performActivityConfirmation` (conditional SSTORE) | 10 хв |
| 6 | **Прибрати або прокоментувати** мертвий код у `_update` (рядки 698-701) | 5 хв |
| 7 | **Запустити Slither** static analysis | 30 хв |
| 8 | **Тест Ownable2Step** flow (`transferOwnership` → `acceptOwnership`) | 15 хв |
| 9 | **NatSpec: `@author`, `@custom:security-contact`** | 5 хв |

### Tier 3 — Для еталонної досконалості

| # | Задача | Зусилля |
|---|--------|---------|
| 10 | **Оновити WHITEPAPER.md** — замінити Phoenix→WillChain, ALIVE→WILL, оновити код snippets, кількість тестів, security model | 3 год |
| 11 | **Rebrand emails** — ALIVE→WILL, ImAlive→WillChain | 30 хв |
| 12 | **Rebrand bot** — Phoenix Protocol Bot→WillChain Bot | 5 хв |
| 13 | **Видалити `scripts/PhoenixLegacy.sol`** — outdated confusion source | 1 хв |
| 14 | **Formal Verification** (extremely optional) — Certora/Halmos on dividend math invariant: `sum(unclaimedDividends) + sum(claimed) == dividendPool_total` | 1-2 тижні |
| 15 | **Bug Bounty програма** через Immunefi (після mainnet) | 1 день |

---

## VI. ФІНАЛЬНА ОЦІНКА ЗА КАТЕГОРІЯМИ

```
┌─────────────────────────────────────────┐
│       WILLCHAIN PROJECT SCORECARD       │
├─────────────────────────────────────────┤
│                                         │
│  Smart Contract Security    ██████████░  91/100
│  Dividend Mathematics       ██████████░  95/100
│  Test Coverage              ████████░░░  88/100
│  Infrastructure (Deploy)    ████████░░░  75/100
│  Documentation              ███████░░░░  72/100
│  Brand Consistency          ██████░░░░░  60/100
│  Bot & Notifications        █████████░░  85/100
│  Architecture Elegance      ██████████░  95/100
│                                         │
│  OVERALL                    █████████░░  87/100
│                                         │
│  After Tier 1 fixes:        ██████████░  93/100
│  After Tier 1+2:            ██████████░  96/100
│  After all tiers:           ██████████░  99/100
│                                         │
└─────────────────────────────────────────┘
```

> [!TIP]
> **Найшвидший шлях до 99%:**
> 1. Виправити deploy.js (15 хв)
> 2. Додати 5 тестів на нові events (1 год)
> 3. Gas optimization (10 хв)
> 4. Оновити whitepaper + emails (3.5 год)
>
> **Разом: ~5 годин роботи.**

---

## VII. ВИСНОВОК

WillChain — це **серйозний, продуманий протокол** з унікальною ринковою позицією. Архітектурно він перевершує більшість DeFi-проектів, які я бачив, завдяки:

- **Простоті** — 1 контракт, 786 рядків, zero external dependencies
- **Математичній коректності** — dividend accumulator без жодного edge case, що міг би призвести до insolvency
- **Defense in depth** — flashloan protection, reentrancy guards, registration isolation, treasury timelock, 2-step ownership

Основні залишкові проблеми — це **не security**, а **operational**: зламаний deploy script, застаріла документація, та бренд-неконсистентність (Phoenix/ImAlive/ALIVE залишки в emails і docs).

Після виправлення Tier 1 + Tier 2 — контракт готовий до **professional external audit** і **testnet beta** з високою впевненістю.
