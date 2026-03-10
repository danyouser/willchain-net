# WillChain — Mainnet Deploy Checklist

Цей документ описує всі кроки, які необхідно виконати **до** деплою на mainnet (Base).

---

## КРИТИЧНО (обов'язково перед деплоєм)

### 1. Новий гаманець деплоєра
- [ ] Згенерувати **новий** гаманець виключно для деплою
- [ ] Нікому не передавати приватний ключ
- [ ] Записати seed phrase у безпечному місці (не в цифровому вигляді)
- [ ] Поповнити ETH для gas

### 2. Gnosis Safe для treasury
- [ ] Створити Gnosis Safe на Base mainnet: https://app.safe.global
- [ ] Підписанти: мінімум 2-of-3 (або 3-of-5) — різні пристрої/люди
- [ ] Записати адресу Safe у `.env` як `TREASURY_ADDRESS`
- [ ] Перевірити що в `deploy.js` treasury = Safe адреса, а НЕ EOA

### 3. EIP-712 верифікація у Telegram боті ✅
- [x] Реалізувати EIP-712 challenge-response у команді `/link`
- [x] Фронтенд: modal "Підписати для прив'язки боту" яка робить `eth_signTypedData_v4`
- [x] Бот перевіряє підпис через `ethers.verifyTypedData(domain, types, value, signature)`
- [x] `telegramId` вбудований у підпис — неможливо прив'язати чужу адресу
- [x] Автоматичний POST `/api/verify-link` → бот відправляє підтвердження в Telegram

**Файли:** [bot/src/eip712.js](bot/src/eip712.js), [bot/src/api.js](bot/src/api.js), [bot/src/index.js](bot/src/index.js)

### 4. Ротація секретів
- [ ] Ротувати `TELEGRAM_BOT_TOKEN` — https://t.me/BotFather → `/revoke`
- [x] Ротувати `GEMINI_API_KEY` — https://aistudio.google.com/app/apikey (оновлено 2026-03-02, збережено у `.env`)
- [ ] Ротувати приватний ключ деплоєра (якщо використовувався на testnet з реальними коштами)
- [x] Перевірити що `.env` у `.gitignore` — `.gitignore` створено (2026-03-06), `.env` включено

### 5. Аудит смарт-контракту ✅
- [x] Запустити повний набір тестів: `npx hardhat test` — **207 passing** (2026-03-07)
- [x] Перевірити coverage: `npx hardhat coverage` — 93%+ Stmts ✓
- [x] Провести аудит смарт-контракту — 52+ вразливості знайдено і виправлено (2026-03-06/07)
- [x] Основні вразливості виправлено та підтверджено тестами:
  - `recycleInactiveNode`: `delete nodeStates` до transfers ✓
  - Flashloan prevention: `lastTransferBlock[node]` per-user ✓
  - Flashloan guard на `completeVaultTransfer()` ✓
  - Frozen dividends включені в recycle розподіл ✓
  - UNREGISTERED free-rider: `totalUnregisteredSupply` + `everRegistered` механізм ✓
  - "Self-suicide" bug: всі settings → `_performActivityConfirmation` ✓
  - initiateSuccessorClaim на ABANDONED vault: заблоковано ✓
  - Treasury timelock: `proposeTreasuryChange` → 2-day delay → `executeTreasuryChange` ✓
  - Circular successor guard: A→B + B→A → revert ✓
  - `Ownable2Step`: двоетапна передача власності ✓
  - `pragma 0.8.24` pinned (не `^0.8.20`) ✓
  - `nonReentrant` на всіх критичних функціях ✓
  - designateSuccessor: не можна призначити `address(this)` ✓
  - updateVaultData: не можна `bytes32(0)` ✓
- [ ] Зовнішній аудит перед mainnet (обов'язково!)

**Файл:** [contracts/WillChain.sol](contracts/WillChain.sol)
**Аудит-гайд для зовнішніх аудиторів:** [docs/AUDIT-GUIDE.md](docs/AUDIT-GUIDE.md)

### 6. Deploy script — ВАЖЛИВО: Treasury тепер через timelock ✅
- [x] `deploy.js` викликає `proposeTreasuryChange(TREASURY_ADDRESS)` — розпочинає 2-денний timelock
- [ ] Після деплою: через 2 дні викликати `executeTreasuryChange()` щоб завершити передачу
- [ ] **НЕ плутати**: `setProtocolTreasury()` видалено з контракту — використовується тільки `proposeTreasuryChange` → `executeTreasuryChange`

### 7. Верифікація контракту на Basescan
- [ ] Після деплою: `npx hardhat verify --network base <CONTRACT_ADDRESS>`
- [ ] Переконатись що код підтверджено на https://basescan.org
- [ ] Оновити адресу контракту у `frontend-react/src/config/contract.ts` та `bot/.env`

---

## БАЖАНО (до або незабаром після деплою)

### 8. npm audit ✅
- [x] `npm audit --audit-level=high` у CI для contract, frontend-react, bot jobs ✓
- [ ] Перевірити npm audit повторно перед mainnet деплоєм

### 9. Оновлення конфігурацій для mainnet
- [x] `hardhat.config.js` — мережа `base` (chainId: 8453) є ✓
- [x] `scripts/deploy.js` — блокує deploy на mainnet якщо `TREASURY_ADDRESS` не встановлено ✓
- [x] `.env.example` — створено з інструкціями для mainnet deploy ✓
- [ ] `bot/.env` — `RPC_URL` вказує на Base mainnet (не Sepolia) — змінити після деплою
- [ ] `frontend-react/src/config/contract.ts` — `CONTRACT_ADDRESS` оновлено на mainnet адресу
- [ ] `frontend-react/src/config/wagmi.ts` — chainId = 8453 (mainnet), не 84532

### 10. Фронтенд (React — canonical)
- [x] React frontend — canonical, 11 мов i18n ✓
- [ ] Перевірити мобільний вигляд (< 480px)
- [ ] Перевірити підключення MetaMask + WalletConnect на mainnet
- [ ] `open-graph`: `og:image` → завантажити реальний `og-image.png` у `frontend-react/public/assets/`

### 11. Rate limiting + Bot
- [x] Rate limiter активний: 10 команд/хв на user, SQLite-backed (persistent) ✓
- [x] 24-годинний cooldown на `/link` активний ✓
- [x] Bot слухає events: SuccessorClaimInitiated, UserActivityConfirmed, VaultAccessTransferred, SuccessorDesignated, NodeRegistered ✓
- [ ] Оновити DEPLOYMENT_BLOCK у `bot/.env` після mainnet deploy
- [ ] BotFather: оновити список команд (`/setcommands`)

### 12. SECURITY.md
- [x] Додано `SECURITY.md` з responsible disclosure policy (security@willchain.net) ✓
- [ ] Перед mainnet: розглянути Immunefi bug bounty програму

---

## Після деплою

- [ ] Записати адресу контракту у всі конфіги (contract.ts, bot/.env, shared/contract-config.js)
- [ ] Через 2 дні: викликати `executeTreasuryChange()` (treasury timelock)
- [ ] Оголосити адресу контракту публічно (Telegram, Twitter)
- [ ] Налаштувати моніторинг: UptimeRobot для `/health` endpoint
- [ ] Зробити перший тестовий "check-in" через фронтенд на mainnet
- [ ] Перевірити що Telegram бот коректно відображає mainnet дані

---

## Довідка

| Файл | Призначення |
|------|-------------|
| [contracts/WillChain.sol](contracts/WillChain.sol) | Смарт-контракт |
| [scripts/deploy.js](scripts/deploy.js) | Скрипт деплою |
| [test/WillChain.test.js](test/WillChain.test.js) | Тести (207 passing) |
| [bot/src/index.js](bot/src/index.js) | Telegram бот |
| [bot/src/database.js](bot/src/database.js) | SQLite база даних бота |
| [frontend-react/src/](frontend-react/src/) | React frontend (canonical) |
| [docs/AUDIT-GUIDE.md](docs/AUDIT-GUIDE.md) | Гайд для аудиторів |
| [SECURITY.md](SECURITY.md) | Responsible disclosure policy |

---

*Оновлено: 2026-03-07 (сесія 8)*
