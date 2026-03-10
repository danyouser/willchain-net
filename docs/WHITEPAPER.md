# WillChain — White Paper v3.0

## Dead Man's Switch for Digital Assets

---

## Зміст

1. [Проблема](#1-проблема)
2. [Рішення](#2-рішення)
3. [Як це працює](#3-як-це-працює)
4. [Tokenomics](#4-tokenomics)
5. [Технічна архітектура](#5-технічна-архітектура)
6. [Безпека](#6-безпека)
7. [Use Cases](#7-use-cases)
8. [Roadmap](#8-roadmap)
9. [Правова база](#9-правова-база)

---

## 1. Проблема

### 1.1 Цифровий цвинтар

Понад **20% всіх крипто-активів** назавжди заблоковані через смерть власника або втрату доступу:

- ~4 млн Bitcoin (~$170B) вважаються назавжди втраченими
- Мільйони ERC-20 гаманців без власника зростають з кожним роком
- "Мертвий капітал" збільшується пропорційно до зростання adoption

Ці токени нікуди не зникають — вони просто лежать мертвим вантажем, штучно скорочуючи реальний circulating supply без будь-якої користі для екосистеми.

### 1.2 Крипто-спадщина — нерозв'язана проблема

Існуючі підходи до передачі крипто-активів у спадок:

| Метод | Проблема |
|-------|----------|
| Передати seed phrase | Ризик безпеки, треба довіряти людині |
| Апаратний гаманець у заповіті | Юридичні затримки, нотаріальні складнощі |
| Кастодіальний сервіс | Ризик контрагента, KYC, централізація |
| Multi-sig з родиною | Технічний бар'єр, координація |

Всі існуючі рішення потребують **довіри до третіх сторін** — що суперечить принципу децентралізації.

### 1.3 Порівняння з аналогами

| Проект | Підхід | Слабкість | WillChain перевага |
|--------|--------|-----------|-------------------|
| **SafeHaven** | ThorChain vault + оракул | Оракул = single point of failure | Жодних оракулів |
| **DigiWill** | Multi-sig + trusted backend | Централізований backend | 100% on-chain |
| **Inheriti** | NFT-based vault + Chainlink keeper | Складна мульти-контрактна архітектура | 1 контракт, ~800 рядків |
| **Gnosis Safe** | Multi-sig + guardians | Потребує N guardians online | 1 successor, trustless |

---

## 2. Рішення

WillChain реалізує **Dead Man's Switch** механізм прямо у смарт-контракті токена WILL.

> Якщо власник неактивний довше встановленого порогу — його токени автоматично перерозподіляються: спалюються, йдуть активним тримачам і спадкоємцям.

### Ключові принципи

1. **Автоматичний Proof of Activity** — будь-яка транзакція з гаманця скидає таймер. Активні юзери не помічають жодних змін.
2. **Trustless успадкування** — спадкоємець визначається on-chain, без нотаріусів і посередників.
3. **Дефляційна механіка** — 47% неактивних токенів спалюється назавжди.
4. **Reward для активних** — 47% йде у dividend pool для активних тримачів.
5. **Один контракт** — вся логіка в одному аудитабельному файлі (~800 рядків).

---

## 3. Як це працює

### 3.1 Стани гаманця

Кожен гаманець з WILL токенами знаходиться в одному з п'яти станів:

```
┌─────────────────────────────────────────────────────────────────┐
│                       WILLCHAIN                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [UNREGISTERED] ── designateSuccessor() ──────────────────────► │
│        Тримає WILL, але ще не виконав setup action               │
│        Не отримує дивіденди (не в пулі)                         │
│                                                                  │
│  [ACTIVE] ──────────────────────────────────────────────────►   │
│     │  Будь-яка вихідна транзакція скидає таймер                │
│     │                                                           │
│     ▼ (після inactivity period: 30/90/180/365 днів)            │
│                                                                  │
│  [GRACE] ────────────────────────────────────────────────────►  │
│     │  +30 днів. Спадкоємець може ініціювати claim.            │
│     │  Власник може скасувати будь-якою транзакцією.           │
│     │                                                           │
│     ▼ (після grace period)                                      │
│                                                                  │
│  [CLAIMABLE] ────────────────────────────────────────────────►  │
│     │  +30 днів. Спадкоємець завершує transfer.                │
│     │  Власник досі може ветувати.                             │
│     │                                                           │
│     ▼ (після claim period)                                      │
│                                                                  │
│  [ABANDONED] ── recycleInactiveNode() ──────────────────────►   │
│        1% → maintainer (хто викликав)                          │
│        5% → protocol treasury                                   │
│       47% → burned forever                                      │
│       47% → dividend pool (зареєстровані активні тримачі)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Налаштовувані periodи неактивності

Кожен користувач обирає свій поріг:

| Inactivity Period | Total Timeout | Для кого |
|-------------------|---------------|----------|
| 30 днів | 90 днів | Активні трейдери |
| 90 днів *(за замовчуванням)* | 150 днів | Звичайні користувачі |
| 180 днів | 240 днів | Довгострокові тримачі |
| 365 днів | 425 днів | Cold storage |

**Total Timeout** = Inactivity Period + 30 (grace) + 30 (claim)

### 3.3 Proof of Activity — автоматично

**Ключова фіча**: прямий вихідний трансфер WILL (де `msg.sender == from`) скидає таймер автоматично.

```
Відправив WILL напряму    → таймер скинуто ✓
Свопнув на Uniswap (через allowance/transferFrom) → НЕ скидає ✗
Спендер переказав через transferFrom()             → НЕ скидає ✗
```

Це захист від M-01 (allowance-based timer griefing): третя сторона не може підтримувати vault "живим" через approve/transferFrom. DEX-трейдинг через allowance не рахується як активність — використовуйте `confirmActivity()` або будь-яку setup-дію для підтвердження liveness.

### 3.4 Механізм успадкування

1. Власник викликає `designateSuccessor(address)` — вказує спадкоємця
2. Після закінчення inactivity period → спадкоємець викликає `initiateSuccessorClaim()`
3. Стартує **30-денний veto period** — власник може скасувати будь-якою транзакцією
4. Якщо veto не надійшло → спадкоємець викликає `completeVaultTransfer()`
5. Токени переходять до спадкоємця повністю

### 3.5 Recycling — якщо немає спадкоємця

Якщо після Total Timeout ніхто нічого не зробив — гаманець переходить у стан ABANDONED. Будь-хто може викликати `recycleInactiveNode()` і отримати 1% винагороди.

---

## 4. Tokenomics

### 4.1 Параметри токена

| Параметр | Значення |
|----------|----------|
| Назва | WillChain Vault Access |
| Символ | WILL |
| Total Supply | 1,000,000,000 (1 млрд) |
| Decimals | 18 |
| Мережа | Base (Ethereum L2) |
| Стандарт | ERC-20 |
| Мінтинг | Відсутній — фіксований supply |

### 4.2 Розподіл при recycling

```
┌──────────────────────────────────────────────────────┐
│           РОЗПОДІЛ (100% токенів гаманця)            │
├──────────────────────────────────────────────────────┤
│                                                      │
│   1%  → Maintainer (хто викликав recycle)            │
│   5%  → Protocol Treasury (розвиток)                 │
│  47%  → BURN (видалено з обігу назавжди)             │
│  47%  → Dividend Pool (зареєстровані тримачі)        │
│                                                      │
│  Всього: 1% + 5% + 47% + 47% = 100% ✓               │
└──────────────────────────────────────────────────────┘
```

### 4.3 Чому тримати WILL вигідно

**Стимул не продавати:**
- Тримаєш WILL і активний → отримуєш дивіденди від "мертвих" гаманців
- Чим більше неактивних гаманців → тим більше дивідендів і менше supply
- Продав WILL → втратив захист і дивіденди

**Game theory:**
```
Усі активно тримають  → burn тиск, supply зменшується
Дехто помирає/забуває → 47% dividend pool для решти
Мережа росте          → більше потенційних recycling подій
```

### 4.4 Дефляційна модель

Жодного мінтингу. Supply може лише зменшуватись.

- **Кожен recycling** → 47% спалюється назавжди
- **При 5% annual inactivity rate** → ~23.5M токенів/рік з обігу
- **Довгостроково** → supply скорочується, активні тримачі отримують більшу частку

### 4.5 Service Tiers

Кількість WILL визначає рівень доступу до сервісів:

| Tier | Мінімум WILL | Можливості |
|------|--------------|------------|
| **Basic Vault** | 1,000+ | Базовий захист, 1 спадкоємець |
| **Family Vault** | 10,000+ | Пріоритетні сповіщення |
| **Legacy Vault** | 100,000+ | Повний функціонал |

### 4.6 Pull-Based Dividends

Дивіденди не розсилаються автоматично (це заощаджує gas і запобігає DoS). Кожен тримач сам вирішує коли клеймити через `claimDividends()`.

Система використовує **Synthetix-патерн** (per-token accumulator):
- O(1) складність — незалежно від кількості тримачів
- Checkpoint оновлюється при кожному трансфері
- Накопичені дивіденди зберігаються при трансфері токенів
- Лише **зареєстровані** тримачі (`everRegistered[addr] == true`) отримують дивіденди

---

## 5. Технічна архітектура

### 5.1 Один контракт

```
WillChain.sol
│
├── ERC20 (OpenZeppelin)           — стандартний токен
├── ERC20Burnable (OpenZeppelin)   — механізм спалення
├── ReentrancyGuard (OpenZeppelin) — захист від reentrancy
└── Ownable2Step (OpenZeppelin)    — двоетапна передача власності
```

Вся бізнес-логіка в одному файлі. Немає проксі, оракулів, зовнішніх залежностей.

### 5.2 Основні функції

#### Для користувачів

```solidity
// Зареєструватись і підтвердити активність вручну
confirmActivity()

// Обрати поріг неактивності (30/90/180/365 днів)
setInactivityPeriod(uint256 _period)

// Вказати спадкоємця
designateSuccessor(address _successor)

// Скасувати claim спадкоємця (veto)
cancelSuccessorClaim()

// Зберегти хеш зашифрованих даних vault (IPFS CID тощо)
updateVaultData(bytes32 _dataHash)

// Забрати свої дивіденди
claimDividends()
```

#### Для спадкоємця

```solidity
// Ініціювати claim після закінчення inactivity period
initiateSuccessorClaim(address _node)

// Завершити transfer після veto period (30 днів)
completeVaultTransfer(address _node)
```

#### Публічні (для всіх)

```solidity
// Переробити покинутий гаманець і отримати 1% винагороди
recycleInactiveNode(address _abandonedNode)
```

### 5.3 State Machine

```solidity
enum VaultStatus { UNREGISTERED, ACTIVE, GRACE, CLAIMABLE, ABANDONED }

function getVaultStatus(address _node) public view returns (VaultStatus)
```

Чіткий стан кожного гаманця. Функції перевіряють стан перед виконанням.

### 5.4 Proof of Activity в коді

```solidity
function _update(address from, address to, uint256 value) internal override {
    // Оновити dividend checkpoints до зміни балансів
    if (from != address(0) && from != address(this)) _updateDividends(from);
    if (to   != address(0) && to   != address(this)) _updateDividends(to);

    super._update(from, to, value);

    // КЛЮЧОВА ФІЧА: будь-який вихідний трансфер скидає таймер відправника
    // Тільки для вже зареєстрованих (lastActivityTimestamp > 0)
    // Реєстрація через будь-яку setup-дію (designateSuccessor, тощо)
    if (from != address(0) && from != address(this)) {
        if (nodeStates[from].lastActivityTimestamp > 0) {
            _performActivityConfirmation(from);
        }
    }

    // Оновити totalUnregisteredSupply при кожному трансфері
    if (_isUnregistered(from)) totalUnregisteredSupply -= value;
    if (_isUnregistered(to))   totalUnregisteredSupply += value;
}
```

### 5.5 Dividend Pool (O(1) алгоритм)

```solidity
// Synthetix-патерн: per-token accumulator
uint256 public dividendPerToken;                         // глобальний акумулятор
mapping(address => uint256) public lastDividendPerToken; // checkpoint кожного юзера

// Додати до пулу — O(1), незалежно від кількості тримачів
// eligibleSupply виключає UNREGISTERED, контракт, та sender
dividendPerToken += (_amount * DIVIDEND_SCALE) / eligibleSupply;

// Підрахувати pending для конкретного юзера — O(1)
uint256 newDividends = (balance * (dividendPerToken - lastDividendPerToken[user])) / SCALE;
```

### 5.6 UNREGISTERED Exclusion

Ключова відмінність від простих ERC-20: нові тримачі токенів **не** накопичують дивіденди до явної реєстрації.

```solidity
mapping(address => bool) public everRegistered;
uint256 public totalUnregisteredSupply; // сума балансів незареєстрованих

// При реєстрації (будь-яка setup-дія: designateSuccessor, setInactivityPeriod, тощо):
// 1. Баланс виходить з totalUnregisteredSupply
// 2. everRegistered[node] = true
// 3. lastDividendPerToken[node] = dividendPerToken (без ретроактивних дивідендів)
```

### 5.7 Структура проекту

```
willchain.net/
├── contracts/
│   └── WillChain.sol              # Єдиний контракт — вся логіка тут (~800 рядків)
├── test/
│   └── WillChain.test.js          # 300+ тестів
├── scripts/
│   ├── deploy.js                  # Деплой скрипт
│   └── check-stats.js             # Статистика мережі
├── shared/
│   ├── vault-status.js            # Canonical status logic
│   └── contract-config.js         # Адреси та chainId
├── frontend-react/                # React + wagmi + RainbowKit (canonical)
│   └── src/
│       ├── config/contract.ts     # ABI та константи
│       └── components/dashboard/  # Dashboard компоненти
├── bot/
│   └── src/
│       └── index.js               # Telegram бот (Grammy)
└── docs/
    ├── WHITEPAPER.md              # Цей документ
    ├── AUDIT-GUIDE.md             # Гайд для аудиторів
    ├── DIVIDEND-MATH.md           # Математика дивідендів
    └── SECURITY-MODEL.md          # Security model для юзерів
```

---

## 6. Безпека

### 6.1 Що власник не може зробити

Після деплою контракту:
- Не може змінити правила розподілу
- Не може заморозити/зупинити контракт
- Не може отримати доступ до чужих токенів
- Не може змінити таймери інших гаманців

Єдина адмін-функція: змінити адресу `protocolTreasury` через **2-денний timelock**:
1. `proposeTreasuryChange(newAddress)` — починає timelock
2. Через 2 дні: `executeTreasuryChange()` — застосовує зміну
3. `cancelTreasuryChange()` — скасовує pending proposal

### 6.2 Захисні патерни

| Механізм | Реалізація |
|----------|------------|
| **Reentrancy Guard** | `nonReentrant` на recycleInactiveNode, claimDividends, completeVaultTransfer, recoverDividendDust |
| **Flashloan Protection** | `lastTransferBlock[addr] < block.number` на recycle, claim, completeTransfer |
| **Access Control** | `onlyDesignatedSuccessor`, `onlyOwner`, `Ownable2Step`, internal `_performActivityConfirmation` |
| **State Machine** | VaultStatus enum з 5 станами запобігає неправильним переходам |
| **No Loops** | Dividend pool O(1), без ітерацій по тримачах |
| **Circular Successor Guard** | A→B + B→A → revert "Circular successor chain" |
| **Treasury Timelock** | 2-day delay для зміни treasury адреси |
| **Smart Wallet Support** | Без tx.origin checks — Safe, ERC-4337 підтримуються |

### 6.3 Audit Fixes (v2 → v3)

| Вразливість | Статус |
|-------------|--------|
| globalLastTransferBlock DoS | ✅ → per-user lastTransferBlock |
| tx.origin guard блокував Smart Wallets | ✅ → видалено |
| UNREGISTERED free-rider dividends | ✅ → totalUnregisteredSupply + everRegistered |
| "Self-suicide" через settings | ✅ → _performActivityConfirmation скрізь |
| initiateSuccessorClaim на ABANDONED vault | ✅ → заблоковано (верхня межа) |
| Circular successor chain | ✅ → явна перевірка |
| Treasury без timelock | ✅ → 2-day propose → execute |
| Ownable → Ownable2Step | ✅ → двоетапна передача |
| Брендинг Phoenix/ALIVE | ✅ → WillChain/WILL |

### 6.4 Аудит

- **253 тести** проходять включно з adversarial scenarios
- Покриваються flashloan, circular successor, race conditions, dividend accounting
- Slither static analysis у CI
- **Потрібен**: professional security audit перед mainnet деплоєм (обов'язково!)
- Для аудиторів: [docs/AUDIT-GUIDE.md](AUDIT-GUIDE.md)

---

## 7. Use Cases

### 7.1 Особиста спадщина

**Сценарій**: Аліса хоче щоб її WILL перейшли до сина якщо щось трапиться.

1. Аліса купує WILL і викликає `designateSuccessor(son.address)` — авто-реєстрація
3. Продовжує активно використовувати гаманець → таймер скидається автоматично
4. Якщо Аліса зникає на 90+ днів → syn може ініціювати claim
5. Ще 30 днів veto period — Аліса може скасувати якщо жива
6. Якщо немає veto → WILL переходять до сина

### 7.2 Cold Storage захист

**Сценарій**: Боб тримає WILL на холодному гаманці роками.

1. Боб встановлює 365-денний period неактивності
2. Total timeout = 425 днів
3. Раз на рік підписує транзакцію підтвердження
4. Гаманець захищений від recycling

### 7.3 Екосистемне очищення

**Сценарій**: Гаманець з 2021 року все ще має WILL але власник давно пропав.

1. Мережа автоматично виявляє ABANDONED стан
2. Будь-хто викликає `recycleInactiveNode()` і отримує 1%
3. 47% WILL спалюється → дефляція
4. 47% WILL → активним тримачам як дивіденди
5. Мережа стає здоровішою

---

## 8. Roadmap

### Stage 1: Core (✅ Завершено)

- [x] WillChain.sol контракт на Base
- [x] 674 тести across 5 suites (adversarial + coverage + fuzz)
- [x] 52+ security fixes після аудитів
- [x] Telegram бот з events + нагадуваннями
- [x] React frontend (wagmi + RainbowKit) з i18n (11 мов)
- [x] EIP-712 wallet linking
- [x] Treasury timelock, Ownable2Step, flashloan guards

### Stage 2: Testnet (Поточний)

- [x] Деплой на Base Sepolia
- [x] Верифікація контракту на Basescan
- [ ] Beta тестування з ~100 реальними гаманцями
- [ ] Stress test Telegram бота

### Stage 3: Trust Building

- [ ] Open source на GitHub
- [ ] Professional external security audit (Trail of Bits / Code4rena)
- [ ] Bug bounty програма (Immunefi)
- [ ] Foundry fuzz tests для dividend math invariant

### Stage 4: Launch

- [ ] Mainnet деплой на Base
- [ ] Liquidity pool WILL/ETH на Uniswap
- [ ] Marketing кампанія
- [ ] Live burned tokens counter на сайті

---

## 9. Правова база

### 9.1 Класифікація токена

**WILL — виключно utility token.**

- Не є цінним папером
- Не дає прав власності на компанію
- Не є інвестиційним контрактом
- Єдина мета: доступ до Dead Man's Switch сервісу

### 9.2 Відповідальність користувачів

Користувачі самостійно відповідають за:
- Своєчасне підтвердження активності
- Безпечне зберігання ключів
- Правильний вибір спадкоємця
- Розуміння механіки контракту
- Відповідність місцевому законодавству

### 9.3 Відмова від гарантій

WillChain — **експериментальне ПЗ**. Використовуйте на власний ризик.

- Смарт-контракти можуть мати баги
- Блокчейн може мати збої
- Ціна токена непередбачувана і не гарантується
- Дефляційна механіка — технічний інструмент, не обіцянка прибутку

---

## Висновок

WillChain вирішує реальну проблему: мільярди доларів заблоковані у недоступних гаманцях назавжди. Dead Man's Switch механіка перетворює цю проблему на можливість:

- **Активні юзери** отримують дивіденди від неактивних
- **Спадкоємці** отримують активи без нотаріусів
- **Мережа** стає здоровішою через дефляцію
- **Протокол** стійко фінансується через 5% fee

Токен WILL — це не просто валюта. Це **стимул залишатись живим учасником мережі**.

---

*WillChain — Secure Your Digital Legacy*

**Version**: 3.0
**Last Updated**: March 2026
**Status**: Testnet — Preparing for External Audit

---

© 2026 WillChain. Всі права захищені.
Цей документ має виключно інформаційний характер і не є фінансовою, юридичною або інвестиційною порадою.
