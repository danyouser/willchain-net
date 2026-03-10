# WillChain

**Decentralized digital inheritance on Base (Ethereum L2)**

WillChain is a Dead Man's Switch protocol that automatically transfers your crypto vault to a designated successor after a configurable inactivity period. No oracles. No custodians. Pure on-chain logic.

> **Status:** Testnet Beta on Base Sepolia

---

## How It Works

1. **Register** — call `confirmActivity()` to activate your vault
2. **Designate** — set a successor address
3. **Stay alive** — periodically confirm activity (30–365 day periods)
4. **Inherit** — if the owner goes inactive, successor initiates a claim with a 30-day veto window
5. **Recycle** — after full timeout, anyone can recycle an abandoned vault and earn 1% of its balance

**Token (WILL):** Every recycle burns 47% and distributes 47% as dividends to all active registered holders. Deflationary and yield-bearing.

---

## Architecture

```
willchain.net/
├── contracts/          # WillChain.sol — single Solidity file, ~820 loc
├── frontend-react/     # React + Vite + TypeScript — canonical frontend
├── frontend/           # Vanilla JS — DEPRECATED (HTTP redirect only)
├── bot/                # Grammy Telegram bot + HTTP API
├── shared/             # vault-status.js, contract-config.js (shared logic)
├── lang/               # i18n JSON (uk.json source → 10 languages via Gemini)
├── test/               # Hardhat tests + Node:test suites
└── docs/               # Audit guide, dividend math, security model, runbook
```

**Stack:**
- Smart contract: Solidity 0.8.24, OpenZeppelin v5, Hardhat
- Frontend: React 18, Vite, TypeScript, wagmi, RainbowKit, react-i18next
- Bot: Grammy (Telegram), better-sqlite3, ethers.js, Resend (email)
- CI: GitHub Actions (contract + react + bot + shared-tests + config-drift + Slither)

---

## Deployed Contracts

| Network | Address |
|---------|---------|
| Base Sepolia (testnet) | [`0x6fAd1475B41731E3eDA21998417Cb2e18E795877`](https://sepolia.basescan.org/address/0x6fAd1475B41731E3eDA21998417Cb2e18E795877) |
| Base Mainnet | — (pending) |

---

## Vault Status Model

```
UNREGISTERED → ACTIVE → GRACE → CLAIMABLE → ABANDONED
```

| Status | Condition |
|--------|-----------|
| UNREGISTERED | Never called `confirmActivity()` |
| ACTIVE | Within inactivity period |
| GRACE | Inactivity period elapsed; successor can initiate claim |
| CLAIMABLE | Claim initiated + 30-day veto window expired |
| ABANDONED | Full timeout elapsed; anyone can recycle |

---

## Tokenomics

On each `recycleInactiveNode()`:
- **47%** → dividend pool (distributed to all active registered holders)
- **47%** → burned (deflationary)
- **5%** → protocol treasury
- **1%** → caller (maintainer incentive)

Service tiers unlock at 1K / 10K / 100K WILL held.

---

## Quickstart

### Prerequisites
- Node.js 20+
- `npm install` in root and `bot/`

### Run frontend (dev)
```bash
cd frontend-react
npm install
npm run dev       # http://localhost:5173
```

### Run bot
```bash
cp bot/.env.example bot/.env
# fill in TELEGRAM_BOT_TOKEN, RPC_URL, CONTRACT_ADDRESS
node bot/src/index.js
```

### Run tests
```bash
npx hardhat test                    # 218 contract tests
cd bot && npm test                  # 95 bot tests
node --test test/vault-status.test.js test/timer-logic.test.js test/i18n.test.js test/i18n-unused.test.js test/translate-utils.test.js  # 89 shared tests
```

### Deploy to testnet
```bash
cp .env.example .env
# fill PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, TREASURY_ADDRESS
npm run deploy:base-sepolia
```

### Translate i18n
```bash
# Requires GEMINI_API_KEY in .env
npm run translate   # uk.json → 10 languages
```

---

## Security

- Audit: 52 findings found and fixed across 8 iterations (see [docs/PROFESSIONAL-AUDIT.md](docs/PROFESSIONAL-AUDIT.md))
- Static analysis: Slither runs in CI on every push
- Responsible disclosure: [SECURITY.md](SECURITY.md)
- Audit guide for external auditors: [docs/AUDIT-GUIDE.md](docs/AUDIT-GUIDE.md)
- Dividend math verification: [docs/DIVIDEND-MATH.md](docs/DIVIDEND-MATH.md)

---

## Docs

| Document | Description |
|----------|-------------|
| [docs/WHITEPAPER.md](docs/WHITEPAPER.md) | Full protocol whitepaper |
| [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) | User-facing security explanation |
| [docs/AUDIT-GUIDE.md](docs/AUDIT-GUIDE.md) | For external auditors |
| [docs/DIVIDEND-MATH.md](docs/DIVIDEND-MATH.md) | Dividend accumulator math |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Operational runbook |
| [docs/MAINNET_CHECKLIST.md](docs/MAINNET_CHECKLIST.md) | Pre-mainnet checklist |

---

## License

MIT — see [LICENSE](LICENSE)
