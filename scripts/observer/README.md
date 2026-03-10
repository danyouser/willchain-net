# Phoenix Observer

Two Python scripts for monitoring ImAlive Protocol vaults.

## Quick Start

```bash
cd scripts/observer
pip install web3 python-dotenv requests
cp .env.example .env
# Edit .env with your settings
python personal_observer.py
```

## Two Scripts

### 1. Personal Observer (`personal_observer.py`)

For individual users monitoring their own wallet. Makes on-chain writes.

- Monitors YOUR wallet nonce every `CHECK_INTERVAL` seconds
- When nonce increases (you made a transaction), checks if deadline is within 75% of your inactivity period
- If close to deadline — calls `confirmActivity()` on-chain to reset the timer
- **Requires**: `PRIVATE_KEY`, `WALLET_ADDRESS`, `PHOENIX_CONTRACT_ADDRESS`

### 2. Phoenix Observer (`phoenix_observer.py`)

Read-only monitoring agent. Does NOT make any transactions.

- Monitors a list of wallet addresses (`WATCH_ADDRESSES`)
- Polls `getVaultStatus()` for each address every `CHECK_INTERVAL` seconds
- Sends Telegram alerts when status changes to GRACE, CLAIMABLE, or ABANDONED
- **Requires**: `WATCH_ADDRESSES`, `PHOENIX_CONTRACT_ADDRESS`
- **Optional**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Configuration (.env)

```env
# Blockchain
RPC_URL=https://mainnet.base.org
PHOENIX_CONTRACT_ADDRESS=0x...

# For personal_observer.py
PRIVATE_KEY=0x<64-hex-chars>
WALLET_ADDRESS=0x...

# For phoenix_observer.py
WATCH_ADDRESSES=0xABC...,0xDEF...

# Optional
CHECK_INTERVAL=3600
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-100123456789
```

## How It Works

### personal_observer.py

```
┌─────────────┐     nonce changed?     ┌──────────────────────┐
│   Wallet    │ ◄──────────────────── │  personal_observer   │
│  (on-chain) │                        │      (Python)        │
└─────────────┘                        └──────────┬───────────┘
                                                   │
                                        near deadline (< 75%)?
                                                   │ yes
                                                   ▼
                                         ┌──────────────────┐
                                         │ confirmActivity()│
                                         └──────────────────┘
```

### phoenix_observer.py

```
┌─────────────────┐     poll status     ┌──────────────────────┐
│  Watched wallets│ ◄──────────────────│  phoenix_observer    │
│   (on-chain)    │                     │  (read-only Python)  │
└─────────────────┘                     └──────────┬───────────┘
                                                    │
                                          status changed?
                                                    │ yes
                                                    ▼
                                         ┌──────────────────┐
                                         │ Telegram alert   │
                                         └──────────────────┘
```

## Vault Status States

| Status    | Meaning                                             |
|-----------|-----------------------------------------------------|
| ACTIVE    | Owner is within inactivity period                   |
| GRACE     | Inactivity period expired, 30-day grace window open |
| CLAIMABLE | Grace period over, successor can claim              |
| ABANDONED | Total timeout exceeded, anyone can recycle tokens   |

## Running as Service (Linux)

```bash
sudo nano /etc/systemd/system/phoenix-observer.service
```

```ini
[Unit]
Description=Phoenix Personal Observer
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/imalive/scripts/observer
ExecStart=/usr/bin/python3 personal_observer.py
Restart=always
RestartSec=10
EnvironmentFile=/home/ubuntu/imalive/scripts/observer/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable phoenix-observer
sudo systemctl start phoenix-observer
sudo journalctl -u phoenix-observer -f  # View logs
```

## Security Notes

- Never commit `.env` — it's in `.gitignore`
- `PRIVATE_KEY` must start with `0x` followed by 64 hex characters
- Use a dedicated wallet for the observer with minimal ETH (just enough for gas)
- `phoenix_observer.py` is read-only and requires no private key
