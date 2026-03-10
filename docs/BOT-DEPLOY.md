# WillChain Bot — Deployment Runbook

Step-by-step guide to deploy the Telegram bot on a fresh server.
Tested on Ubuntu 22.04 / Debian 12.

---

## Prerequisites

- Node.js 20+
- Git access to this repository
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- RPC URL for Base Sepolia (or Base mainnet)

---

## 1. Clone and install

```bash
git clone https://github.com/your-org/willchain.net.git
cd willchain.net/bot
npm install --omit=dev
```

---

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `CONTRACT_ADDRESS` | WillChain contract (see `shared/contract-config.js`) |
| `RPC_URL` | `https://sepolia.base.org` or `https://mainnet.base.org` |
| `FRONTEND_URL` | `https://willchain.net` |
| `EXPLORER_URL` | `https://sepolia.basescan.org` or `https://basescan.org` |
| `DEPLOYMENT_BLOCK` | Block number when contract was deployed (find on Basescan) |
| `API_PORT` | Default `3001` |

Optional:

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Email notifications via Resend.com |
| `EMAIL_FROM` | Sender address (must be verified in Resend) |
| `TRUST_PROXY` | Set to `true` if running behind nginx/Caddy |
| `EVENT_CATCHUP_BLOCKS` | Fallback if `DEPLOYMENT_BLOCK` not set (default `10000`) |

**Finding `DEPLOYMENT_BLOCK`:**
Go to Basescan → contract address → "Contract Creation" transaction → copy block number.
This ensures the bot catches all events from day one on first run.

---

## 3. SQLite database

The bot creates its database automatically at `bot/data/phoenix_bot.db`.

```bash
# Ensure the data directory exists (bot creates it, but just in case)
mkdir -p data
```

The database persists across restarts. **Do not delete it** — it stores:
- User wallet mappings
- Last processed block (for event replay)
- Rate limit state
- Pending link challenges

**Backup:**
```bash
cp data/phoenix_bot.db data/phoenix_bot.db.bak
```

---

## 4. First run (smoke test)

```bash
node src/index.js
```

Expected output:
```
[DB] Initializing database...
[DB] Database initialized successfully
[timestamp] 📋 WillChain Bot starting...
[timestamp] 📋 Database: 0 users, last block: none
[timestamp] 📋 Contract initialized at 0x6fAd1...
[timestamp] 📋 First run: scanning from deployment block 12345 to 99999
[timestamp] ✅ Event listeners active
[timestamp] 📋 Bot started successfully
```

Press Ctrl+C after confirming startup. Proceed to systemd setup.

---

## 5. systemd service

```bash
sudo nano /etc/systemd/system/willchain-bot.service
```

```ini
[Unit]
Description=WillChain Telegram Bot
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/willchain.net/bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=willchain-bot
EnvironmentFile=/home/ubuntu/willchain.net/bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable willchain-bot
sudo systemctl start willchain-bot
sudo systemctl status willchain-bot
```

---

## 6. Verify health endpoint

```bash
curl -s http://127.0.0.1:3001/health | jq
```

Expected (healthy):
```json
{
  "ok": true,
  "uptime": 42,
  "bot": true,
  "contract": true,
  "lastEventBlock": 99999,
  "blockLagMs": 3200,
  "blockLagAlert": false,
  "ts": "2026-03-07T12:00:00.000Z"
}
```

If `"ok": false` or HTTP 503 — check:
- `bot: false` → Telegram token invalid or network issue
- `contract: false` → RPC_URL or CONTRACT_ADDRESS wrong
- `blockLagAlert: true` → Event listener stuck; `blockLagMs` shows how long since last block

---

## 7. nginx reverse proxy (API for frontend)

The bot's HTTP API must be accessible to the frontend at `/api/` or a subdomain.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
}
```

Also set in `.env`:
```
TRUST_PROXY=true
```

---

## 8. Logs

```bash
# Live logs
sudo journalctl -u willchain-bot -f

# Last 100 lines
sudo journalctl -u willchain-bot -n 100

# Since last boot
sudo journalctl -u willchain-bot -b
```

---

## 9. Updates

```bash
cd /home/ubuntu/willchain.net
git pull
cd bot && npm install --omit=dev
sudo systemctl restart willchain-bot
sudo systemctl status willchain-bot
curl -s http://127.0.0.1:3001/health | jq .ok
```

---

## 10. Rollback

```bash
git log --oneline -10         # find last good commit
git checkout <commit-hash>
sudo systemctl restart willchain-bot
```

---

## Operational checks

Daily/weekly checks for the operator:

```bash
# 1. Is the bot running?
systemctl is-active willchain-bot

# 2. Is the API healthy?
curl -s http://127.0.0.1:3001/health | jq '{ok, blockLagAlert, uptime}'

# 3. What block are we on?
curl -s http://127.0.0.1:3001/health | jq '.lastEventBlock'

# 4. Any errors in the last hour?
sudo journalctl -u willchain-bot --since "1 hour ago" --priority err

# 5. Database size check
du -sh data/phoenix_bot.db

# 6. Full release gate (from project root)
cd /home/ubuntu/willchain.net && npm run qa:quick
```

**Alert mismatch troubleshooting:**
- If bot sends alerts that don't match contract state: restart bot (`systemctl restart willchain-bot`). It re-syncs from `lastProcessedBlock` in the database.
- If `blockLagAlert: true` persists after restart: check RPC URL connectivity, try a different provider.
- If processed_events table grows too large: the bot auto-cleans entries older than 6 hours. Manual cleanup: `sqlite3 data/phoenix_bot.db "DELETE FROM processed_events WHERE timestamp < strftime('%s','now') - 86400"`

---

## Incident checklist

| Symptom | Check |
|---------|-------|
| Bot not responding | `systemctl status willchain-bot` → look for crash |
| `/health` returns 503 | `curl /health` → check which field is false |
| `blockLagAlert: true` | RPC issue or event listener crashed; restart bot |
| No Telegram messages | Check `TELEGRAM_BOT_TOKEN`; test with `curl https://api.telegram.org/bot<TOKEN>/getMe` |
| Database locked | Another process holds SQLite; `lsof data/phoenix_bot.db` |
| High memory usage | Check `processed_events` table size: `sqlite3 data/phoenix_bot.db "SELECT COUNT(*) FROM processed_events"` |
