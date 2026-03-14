# WillChain Security Review

## Професійний аудит-звіт

| Поле | Значення |
|---|---|
| Замовник | WillChain |
| Протокол | WillChain / `WILL` |
| Тип рев'ю | Ручний security review з валідацією тестами |
| Основний scope | `contracts/WillChain.sol` |
| Перевірений commit | `0789e13` (last change to `contracts/WillChain.sol`) |
| Дата рев'ю | 2026-03-14 |
| Solidity | `0.8.24` |
| Розмір коду | `968` LOC контракту / `4,373` LOC Hardhat-тестів / `548` LOC Foundry fuzz-тестів |
| Класифікація | Internal independent review у форматі, наближеному до звітів провідних audit firms |
| Важлива примітка | Цей документ не замінює зовнішній third-party audit від Trail of Bits, OpenZeppelin, Consensys Diligence, Spearbit, Cantina або Cyfrin |

---

## Зміст

1. Executive Summary
2. Scope
3. Methodology
4. System Overview
5. Severity Definitions
6. Findings Summary
7. Detailed Findings
8. Security Strengths
9. Validation Performed
10. Recommendations
11. Conclusion

---

## 1. Executive Summary

WillChain реалізує ERC-20 токен із dead-man's-switch state machine, successor claiming, permissionless recycling abandoned balances та pull-based dividend redistribution. Поточний дизайн виглядає суттєво сильнішим за типовий single-contract MVP: використано `Ownable2Step`, treasury timelock, explicit registration semantics, per-user flashloan guards та O(1) dividend accumulator, який коректно виключає unregistered balances із dividend eligibility.

У перевіреному commit не виявлено critical або high severity issues. Контракт пройшов повний Hardhat suite, а Foundry fuzz suite успішно відпрацював в offline mode. Основний залишковий ризик пов'язаний не з reentrancy чи арифметикою, а з protocol-design gap: раніше видані ERC-20 allowances залишаються придатними навіть тоді, коли vault уже inactive, claimable або abandoned. На практиці це означає, що spender, якого було схвалено до настання inactivity, може все ще transfer або burn чужих токенів, послаблюючи inheritance guarantees, які користувачі логічно очікують від продукту.

### Підсумок аудиту

| Severity | Кількість |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |
| Informational | 2 |

### Загальна оцінка

Поточна on-chain implementation придатна для подальшої testnet / beta експлуатації. Водночас код ще не на тому рівні, де проєкт повинен позиціонувати себе як externally audited. Відкрите medium-severity питання слід або виправити, або явно прийняти та задокументувати до mainnet.

---

## 2. Scope

### In Scope

| Path | Опис |
|---|---|
| `contracts/WillChain.sol` | Основна protocol logic |
| `test/WillChain.test.js` | Behavioral і regression tests |
| `test/foundry/WillChainFuzz.t.sol` | Fuzz та invariant tests |
| Security / protocol docs | Використані для consistency-check між документацією та реальною implementation |

### Out of Scope

| Область | Причина |
|---|---|
| `frontend-react/` | Повноцінний frontend security review у цей прохід не входив |
| `bot/` | Off-chain service; переглянуто лише trust assumptions |
| Deployment / infra hardening | Не перевірялися глибоко, окрім documentation consistency |
| OpenZeppelin dependencies | Вважаються безпечними як upstream audited libraries |

---

## 3. Methodology

Рев'ю поєднувало:

1. Ручний line-by-line analysis контракту та всіх ключових state transitions.
2. Adversarial review inheritance, recycling, dividend, allowance та governance flows.
3. Cross-check коду проти protocol/security documentation.
4. Dynamic validation локальними test suites.
5. Перевірку наявного Slither output.

Основні фокуси:

- State-machine integrity у `ACTIVE`, `GRACE`, `CLAIMABLE` і `ABANDONED`
- Dividend accounting і solvency
- Вплив `transfer`, `transferFrom`, `burn`, `burnFrom` на liveness
- Successor timing і recycle races
- Governance та privileged operations

---

## 4. System Overview

WillChain поєднує чотири механізми в одному token contract:

1. Registration and liveness: holder стає active vault лише після explicit setup action або `confirmActivity()`.
2. Inheritance flow: після inactivity designated successor може відкрити veto window і згодом завершити full-balance transfer.
3. Recycling flow: abandoned balances можуть бути permissionlessly redistributed як 47% burn, 47% dividends, 5% treasury та 1% caller reward.
4. Dividend accounting: recycled balances розподіляються через per-token accumulator із виключенням unregistered holders із eligibility.

Дизайн навмисно opinionated: direct transfers рахуються як liveness, `transferFrom` не рахуються, а abandoned wallet все ще може self-resurrect до моменту recycle, якщо owner повернувся.

---

## 5. Severity Definitions

| Severity | Опис |
|---|---|
| Critical | Пряма, майже гарантована втрата коштів або permanent protocol failure без значущих preconditions |
| High | Серйозна втрата коштів, privilege compromise або invariant break у реалістичному сценарії |
| Medium | Матеріальна security / economic weakness із preconditions, яку варто усунути до mainnet |
| Low | Обмежений за впливом issue, liveness edge case або слабке припущення, яке треба уточнити |
| Informational | Code-quality, specification або documentation discrepancy без значного direct security impact |

---

## 6. Findings Summary

| ID | Назва | Severity | Status |
|---|---|---|---|
| M-01 | Approved spenders can extract inactive vault balances through lingering allowances | Medium | Open |
| L-01 | Successor can extend the abandonment deadline by initiating a claim late | Low | Acknowledged |
| I-01 | Successor contract-address policy is implemented inconsistently with user-facing messaging | Informational | Open |
| I-02 | Operational docs overstate current governance semantics in two places | Informational | Fixed |

---

## 7. Detailed Findings

### M-01: Approved spenders can extract inactive vault balances through lingering allowances

| Поле | Значення |
|---|---|
| Severity | Medium |
| Тип | Design / economic security |
| Status | Open |
| Локація | `contracts/WillChain.sol:868-883`, inherited `transferFrom` / `burnFrom` paths |

#### Опис

Контракт коректно закриває попередню проблему allowance-based timer keepalive, оскільки third-party `transferFrom` більше не reset'ить liveness. Проте поточна implementation усе ще дозволяє approved spenders переміщати або спалювати `WILL` користувача, поки його vault уже перебуває у `GRACE`, `CLAIMABLE` або навіть `ABANDONED`.

Для WillChain це важливіше, ніж для звичайного ERC-20, бо core promise протоколу така:

- inactive balance має або перейти designated successor,
- або бути recycled протоколом.

Ця гарантія послаблюється, якщо зовнішній spender із pre-existing allowance може спершу спорожнити vault.

Поточна поведінка прямо випливає з implementation і тестів:

- `transferFrom` навмисно дозволений, але не reset'ить owner timer;
- тести явно підтверджують, що spender-driven `transferFrom` під час `GRACE` не resurrect'ить vault.

На практиці це означає, що користувач, який колись дав allowance router'у, dApp'у або malicious contract, уже міг створити обхід inheritance model.

#### Вплив

Якщо користувач видав allowance до настання inactivity, approved spender може:

- вивести токени з vault до завершення successor claim,
- зменшити баланс, доступний для recycling,
- або спалити токени через `burnFrom`, якщо allowance зберігся.

Для атаки не потрібен компроміс owner key. Єдина реалістична передумова - існуючий allowance, а для DEX / DeFi users це типова ситуація.

#### Рекомендація

До mainnet варто обрати один із підходів:

1. Консервативний: заборонити third-party `transferFrom` / `burnFrom`, щойно vault перестає бути `ACTIVE`.
2. Вужчий: заборонити delegated spending лише у `CLAIMABLE` і `ABANDONED`.
3. Якщо пріоритетом є composability, явно оформити це як first-class trust assumption і додати сильні UI warnings щодо unlimited approvals.

З product-security точки зору варіант 1 або 2 виглядає кращим. WillChain уже є спеціалізованим токеном із custom liveness semantics, тому збереження dormant-vault integrity тут важливіше за ідеальну ERC-20 composability.

---

### L-01: Successor can extend the abandonment deadline by initiating a claim late

| Поле | Значення |
|---|---|
| Severity | Low |
| Тип | Liveness / policy |
| Status | Acknowledged |
| Локація | `contracts/WillChain.sol:306-320`, `contracts/WillChain.sol:347-350`, `contracts/WillChain.sol:601-624` |

#### Опис

`initiateSuccessorClaim()` дозволено викликати будь-коли після завершення inactivity period і аж до natural abandoned deadline. Після цього `claimInitiationTimestamp` стає новою часовою опорою для `GRACE -> CLAIMABLE -> ABANDONED`.

У підсумку designated successor може дочекатися самого кінця natural `CLAIMABLE` window, а потім майже ще на 60 днів відсунути final abandonment date.

У NatSpec це прямо описано як intentional behavior, але воно все одно змінює liveness properties системи:

- recycling може бути відкладений;
- economic redistribution відкладається;
- designated successor зберігає optionality, не діючи оперативно.

#### Вплив

Issue не призводить до прямої крадіжки коштів, але погіршує передбачуваність timeout model і дозволяє successor суттєво відкладати finality.

#### Рекомендація

Якщо policy протоколу справді полягає в тому, що successor має пріоритет над recyclers, цю поведінку варто зберегти, але зробити її максимально явною в documentation. Якщо ж intended policy - fixed-time finality, тоді потрібно або:

- дозволити `initiateSuccessorClaim()` лише у `GRACE`,
- або не змінювати original abandoned deadline після initiation.

---

### I-01: Successor contract-address policy is implemented inconsistently with user-facing messaging

| Поле | Значення |
|---|---|
| Severity | Informational |
| Тип | Specification mismatch |
| Status | Open |
| Локація | `contracts/WillChain.sol:275-284` |

#### Опис

Код revert'иться з `CannotDesignateContract()` лише тоді, коли `_successor == address(this)`. Він не блокує arbitrary contract addresses.

Це не узгоджується ні з назвою помилки, ні з user-facing localization strings, де сказано, що contract addresses не можуть бути designated heirs. Розбіжність особливо помітна, бо в інших частинах docs окремо заявлена підтримка smart wallets, таких як Safe та ERC-4337 accounts.

Фактично код наразі дозволяє contract successors, окрім самого token contract.

#### Рекомендація

Слід вирівняти specification з implementation. Найчистіший шлях - перейменувати error і UI copy так, щоб вони описували реальне правило:

- заборонений лише сам token contract,
- smart wallets і multisigs дозволені як successors.

Запровадження generic "no contracts" rule буде конфліктувати з задекларованою smart-wallet support model.

---

### I-02: Operational docs overstate current governance semantics in two places

| Поле | Значення |
|---|---|
| Severity | Informational |
| Тип | Documentation drift |
| Status | Fixed |
| Локація | `docs/ACCEPTED-TRADEOFFS.md:10`, `docs/ACCEPTED-TRADEOFFS.md:32` |

#### Опис

Два твердження в документації не збігаються з реальною implementation:

1. `docs/ACCEPTED-TRADEOFFS.md` стверджує, що після delay будь-хто може викликати `executeTreasuryChange()`, тоді як у коді ця функція захищена `onlyOwner`.
2. Там само сказано, що dust recovery "переносить unclaimed fractions у dividend pool", тоді як код переводить dust у `protocolTreasury` або `owner()`.

Це не direct contract vulnerability, але така розбіжність важлива для operational transparency і user expectations щодо privileged actions.

#### Рекомендація

Оновити documentation так, щоб governance і treasury behavior були описані рівно так, як вони реалізовані в коді.

---

## 8. Security Strengths

Окрім findings, контракт має помітно сильні рішення:

- використовується `Ownable2Step`, а не direct ownership transfer;
- зміна treasury timelocked;
- recycle та dividend paths захищені `nonReentrant`;
- dividend distribution виключає unregistered balances і не допускає retroactive accrual;
- fresh-abandoned recycling захищений commit-reveal проти простого MEV на caller reward;
- per-user `lastTransferBlock` значно безпечніший за глобальний block-level guard;
- контракт immutable і не залежить від upgrade proxy.

---

## 9. Validation Performed

### Dynamic Validation

| Перевірка | Результат |
|---|---|
| `npm test` | Passed: `299 passing` |
| `forge test --match-contract WillChainFuzz --offline` | Passed: `14/14` (1,000 fuzz runs each) |
| Slither output review | Один low-signal warning щодо sentinel equality (`period == 0`) |

### Invariants, які підтверджені тестами та manual review

- `dividendPool <= balanceOf(address(this))`
- unregistered balances виключені з dividend eligibility
- `totalSupply()` після deployment лише зменшується
- `totalUnregisteredSupply` консистентно відстежує unregistered balances
- fresh abandoned vaults потребують commit-reveal
- `transferFrom` більше не reset'ить owner liveness

### Залишкові validation gaps

У цей прохід не входили:

- повноцінне frontend security testing,
- повний penetration review бота та інфраструктури,
- formal verification,
- зовнішній adversarial review від незалежної audit firm.

---

## 10. Recommendations

До mainnet:

1. Усунути або явно прийняти M-01, бо він прямо впливає на inheritance promise продукту.
2. Вирішити, чи delayed successor-initiated deadline extension є feature, чи небажаною liveness cost.
3. Прибрати successor-policy та governance documentation drift.
4. Перенести ownership і treasury control на Safe multisig до появи значущої economic value.
5. Отримати реальний third-party smart-contract audit і зафіксувати audited commit hash у публічному звіті.

---

## 11. Conclusion

Поточна smart-contract implementation WillChain суттєво міцніша за типовий first-release inheritance token. Основний залишковий ризик у перевіреному commit - це не low-level exploit, а архітектурний конфлікт між ERC-20 allowances і dead-man's-switch guarantees протоколу. Його можна виправити, а решта contract logic демонструє дисципліновану роботу зі state transitions, dividend accounting і privileged actions.

Якщо medium finding буде закрито, а documentation drift прибрано, кодова база виглядатиме як хороший кандидат на зовнішній аудит. До цього моменту цей документ слід трактувати як internal professional-style review, а не як заміну незалежному third-party assurance.
