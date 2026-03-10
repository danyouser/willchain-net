# WillChain — Testnet Beta Readiness Checklist

> Дорожня карта до 99.99% еталонного контракту.
> Відсортовано за пріоритетом: 🔴 Critical → 🟠 High → 🟡 Medium → 🟢 Low → ⚪ Polish

---

## 🔴 CRITICAL — Без них не деплоїти

### ~~1. Deploy-скрипт зламаний: `setProtocolTreasury()` видалено~~ ✅ ВИПРАВЛЕНО

`deploy.js` оновлено: викликає `proposeTreasuryChange()` замість видаленої `setProtocolTreasury()`.

---

### 2. Тести: `DividendsBurnedNoEligibleHolders` — неперевірений edge case

Нова подія `DividendsBurnedNoEligibleHolders` у `_addToDividendPool` спрацьовує коли `eligibleSupply == 0`. Це екстремальний сценарій (всі зареєстровані вийшли), але **жоден тест** його не покриває.

**Додати тест:**
```javascript
it("burns dividends when eligibleSupply == 0 (no registered holders)", async function () {
  // All registered holders transfer to unregistered address
  const unregistered = (await ethers.getSigners())[5];
  await phoenix.transfer(unregistered.address, INITIAL_SUPPLY);
  
  // owner's nodeState deleted, now recycle from unregistered's perspective...
  // Force a scenario where eligibleSupply == 0 to verify burn+event
});
```

---

### 3. `completeVaultTransfer`: відсутній flashloan guard

[WillChain.sol:285](file:///Users/bohdanlukach/Sites/willchain.net/contracts/WillChain.sol#L285)

`recycleInactiveNode` та `claimDividends` мають перевірку `lastTransferBlock[x] < block.number`, але `completeVaultTransfer` — **ні**. Атакуючий може:
1. Flashloan WILL → Transfer до successor-адреси (збільшити баланс)
2. `completeVaultTransfer()` — забрати vault + зростили дивіденди
3. Repay у тому ж блоці

**Фікс:**
```solidity
function completeVaultTransfer(address _node) external onlyDesignatedSuccessor(_node) nonReentrant {
+   require(lastTransferBlock[msg.sender] < block.number, "Flashloan prevention");
    NodeState storage state = nodeStates[_node];
```

---

## 🟠 HIGH — Суттєво вплинуть на якість

### 4. Ownership — відсутність 2-step transfer

Якщо owner-key скомрезований або вказана неправильна адреса при `transferOwnership()`, доступ до admin-функцій **втрачається НАЗАВЖДИ**. OpenZeppelin має `Ownable2Step`, який вимагає підтвердження від нового власника.

**Фікс:**
```diff
- import "@openzeppelin/contracts/access/Ownable.sol";
+ import "@openzeppelin/contracts/access/Ownable2Step.sol";

- contract WillChain is ERC20, ERC20Burnable, ReentrancyGuard, Ownable {
+ contract WillChain is ERC20, ERC20Burnable, ReentrancyGuard, Ownable2Step {

  constructor() ERC20("WillChain", "WILL") Ownable(msg.sender) {
```

> [!IMPORTANT]
> `Ownable2Step` наслідує `Ownable`, тому конструктор не змінюється. Але `transferOwnership()` тепер ставить pending owner, а реальна зміна відбувається тільки після `acceptOwnership()` новим власником.

---

### 5. `_update` hook: dividend snapshot для **першого** отримувача хибний при partial transfer

[WillChain.sol:692-695](file:///Users/bohdanlukach/Sites/willchain.net/contracts/WillChain.sol#L692-L695)

```solidity
if (to != address(0) && to != address(this) && balanceOf(to) == value) {
    lastDividendPerToken[to] = dividendPerToken;
}
```

Цей чек працює тільки якщо `value` — це перший трансфер до `to`. Але `_updateDividends(to)` вже викликається на рядку 675 **перед** `super._update`. Тому `lastDividendPerToken[to]` **вже** оновлено до `dividendPerToken` функцією `_updateDividends`, і цей рядок 694 — **мертвий код** для зареєстрованих юзерів, і **дублікат** для незареєстрованих (бо `_performActivityConfirmation` теж сетить snapshot).

**Це не баг, але мертвий код створює хибне враження про те, хто за що відповідає.** Рекомендую:
- Або прибрати рядки 692-695 повністю (вистачає `_updateDividends`)
- Або залишити як safety net з коментарем `// REDUNDANT: kept as defense-in-depth`

---

### 6. Email-шаблони: references до `ALIVE` замість `WILL`

[email.js:96](file:///Users/bohdanlukach/Sites/willchain.net/bot/src/email.js#L96)

```javascript
`<li><strong>Amount:</strong> ${amount} ALIVE</li>`
```

Токен перейменовано на **WILL**, але email-шаблон досі показує **ALIVE**. Це плутаниця для користувачів.

**Фікс:**
```diff
- `<li><strong>Amount:</strong> ${amount} ALIVE</li>`
+ `<li><strong>Amount:</strong> ${amount} WILL</li>`
```

Також перевірити: `ImAlive` → `WillChain` в subject-рядках та текстах emails.

---

### 7. Bot: Log message каже `Phoenix Protocol` замість `WillChain`

[index.js:982](file:///Users/bohdanlukach/Sites/willchain.net/bot/src/index.js#L982)

```javascript
log('INFO', '🔥 Phoenix Protocol Bot starting...');
```

Бранд треба узгодити — замінити всі `Phoenix Protocol` на `WillChain`.

---

## 🟡 MEDIUM — Підвищать надійність

### 8. Додати `event OwnerRegistered(address)` для чіткої аналітики

Коли хтось вперше викликає `confirmActivity()`, єдиний event — загальний `ActivityConfirmed`. Не можна розрізнити "перша реєстрація" від "звичайне підтвердження".

**Фікс:**
```solidity
event NodeRegistered(address indexed node, uint256 timestamp);

function _performActivityConfirmation(address node) internal {
    if (!everRegistered[node]) {
        ...
+       emit NodeRegistered(node, block.timestamp);
    }
    ...
}
```

Це також корисно для analytics dashboard та бота.

---

### 9. `recoverDividendDust` — відсутній `nonReentrant`

Хоча `_transfer` у OpenZeppelin ERC20 не є reentrancy-вектором сам по собі, `recoverDividendDust` працює з `dividendPool`-залежними обчисленнями. Для defense-in-depth:

```diff
- function recoverDividendDust() external onlyOwner {
+ function recoverDividendDust() external onlyOwner nonReentrant {
```

---

### 10. Відсутній `event` для `cancelTreasuryChange`

`proposeTreasuryChange` має `TreasuryChangeProposed`, `executeTreasuryChange` має `TreasuryUpdated`, але `cancelTreasuryChange` — **silent**. Це ускладнює off-chain моніторинг.

```solidity
+ event TreasuryChangeCancelled(address indexed cancelledProposal);

function cancelTreasuryChange() external onlyOwner {
    require(pendingTreasury != address(0), "No pending treasury change");
+   emit TreasuryChangeCancelled(pendingTreasury);
    pendingTreasury = address(0);
    pendingTreasuryEffectiveAt = 0;
}
```

---

### 11. NatSpec: контракт-рівень документація

Контракт чудово задокументований всередині, але не має `@author`, `@notice` (для contract-level), і `@custom:security-contact` — все це стандарт для verified contracts на Basescan.

```solidity
/// @title WillChain (WILL)
/// @author WillChain Team
/// @notice Dead Man's Switch token on Base. Stay active or your tokens get recycled.
/// @custom:security-contact security@willchain.net
contract WillChain is ERC20, ERC20Burnable, ReentrancyGuard, Ownable {
```

---

### 12. Gas optimization: `_performActivityConfirmation` записує 3 storage slots кожну транзакцію

Кожного разу, коли зареєстрований юзер робить `transfer`, хук `_update` викликає `_performActivityConfirmation`, який пише:
1. `lastActivityTimestamp = block.timestamp`
2. `successorClaimInitiated = false`
3. `claimInitiationTimestamp = 0`

Слоти #2 і #3 зазвичай **вже** false/0. Це безглузді SSTORE операції (кожна ~100 gas cold / 2900 warm).

**Фікс:**
```solidity
function _performActivityConfirmation(address node) internal {
    ...
    nodeStates[node].lastActivityTimestamp = block.timestamp;
-   nodeStates[node].successorClaimInitiated = false;
-   nodeStates[node].claimInitiationTimestamp = 0;
+   if (nodeStates[node].successorClaimInitiated) {
+       nodeStates[node].successorClaimInitiated = false;
+       nodeStates[node].claimInitiationTimestamp = 0;
+   }
    emit ActivityConfirmed(node, block.timestamp);
}
```

Економія: ~5,800 gas на кожен трансфер зареєстрованого юзера (99.9% випадків).

---

## 🟢 LOW — Полірувальні штрихи

### 13. Тести: покрити новий event `FrozenDividendsRecovered`

Подія додана, але жоден тест не перевіряє що вона правильно emit-иться з правильними аргументами.

---

### 14. Тести: покрити `DividendDustRecovered` event

Аналогічно — event додано, тест відсутній.

---

### 15. `recoverDividendDust`: Rounding attack surface

Теоретично, якщо хтось цілеспрямовано відправить токени напряму на адресу контракту (не через `_addToDividendPool`), вони потраплять у "dust" і можуть бути зібрані owner'ом. Це не баг, але варто задокументувати:

```solidity
/// @notice Recover dust tokens in the contract due to division truncation.
/// @dev Also recovers tokens accidentally sent directly to this contract.
///      This is intentional — tokens sent to the contract address outside of
///      the dividend mechanism are NOT retrievable by their sender.
function recoverDividendDust() ...
```

---

### 16. Hardhat config: pin compiler version

[hardhat.config.js](file:///Users/bohdanlukach/Sites/willchain.net/hardhat.config.js)

```javascript
solidity: { version: "0.8.24" }
```
Контракт використовує `pragma solidity ^0.8.20`. Рекомендую пінити точну версію:
```diff
- pragma solidity ^0.8.20;
+ pragma solidity 0.8.24;
```
Це гарантує, що при deploy буде використана саме та версія, з якою тестували.

---

## ⚪ POLISH — Перед mainnet

### 17. Rename variables/events для консистентності

| Поточне ім'я | Рекомендоване |
|---|---|
| `phoenix` (в тестах) | `willchain` |
| `PhoenixLegacy.sol` (scripts) | Видалити або перемістити в archive |
| `email.js: ImAlive` | `WillChain` |
| `bot: Phoenix Protocol Bot` | `WillChain Bot` |

---

### 18. Slither / Mythril static analysis

До testnet beta рекомендую запустити:
```bash
slither contracts/WillChain.sol --filter-paths "node_modules"
```
Автоматизований аналіз часто знаходить edge cases які людський ревью пропускає (наприклад, unchecked return values, shadowed variables).

---

### 19. Gas report та storage layout

```bash
npx hardhat test --gas-reporter
```
Це дасть точну карту gas-витрат для кожної функції. Особливо важливо для `recycleInactiveNode` (яка робить 5+ transfer/burn операцій) та `_update` hook.

---

## Загальний статус

| Категорія | Кількість | Стан |
|---|---|---|
| 🔴 Critical | 3 | Вимагає фіксу |
| 🟠 High | 4 | Настійно рекомендується |
| 🟡 Medium | 5 | Підвищать якість |
| 🟢 Low | 4 | Фінальне полірування |
| ⚪ Polish | 3 | Перед mainnet |

> [!TIP]
> **Пріоритет дій:**
> 1. Фікс deploy.js (#1) — **без нього деплой впаде**
> 2. Flashloan guard в completeVaultTransfer (#3) — **security hole**
> 3. Ownable2Step (#4) — **захист від людської помилки**
> 4. Gas optimization (#12) — **ваші юзери заощадять на gas**
> 5. Весь іншій список по порядку

