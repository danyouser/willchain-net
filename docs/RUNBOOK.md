# WillChain Operations Runbook

## Architecture Overview

```
Internet → nginx/caddy (willchain.net)
               ├── /          → frontend/ (legacy) or frontend-react/dist/
               └── /api       → localhost:3001 (bot HTTP API)

bot/src/index.js   — Telegram bot + cron jobs + event listener
bot/src/api.js     — HTTP server on 127.0.0.1:3001
SQLite DB          — bot/data/willchain.db (or path set in env)
```

---

## Deployment

### First deploy

```bash
# 1. Clone and install
git clone ... && cd willchain.net
npm ci                          # root (hardhat + scripts)
cd frontend-react && npm ci && npm run build && cd ..
cd bot && npm ci && cd ..

# 2. Configure
cp .env.example .env            # fill PRIVATE_KEY, RPC URLs, BASESCAN_API_KEY
cp bot/.env.example bot/.env    # fill TELEGRAM_BOT_TOKEN, CONTRACT_ADDRESS, RPC_URL

# 3. Deploy contract (testnet first)
npm run deploy:base-sepolia
# → saves address to deployments/baseSepolia-latest.json

# 4. Update CONTRACT_ADDRESS in bot/.env
# 5. Start bot
cd bot && node src/index.js
```

### Update bot after contract redeploy

```bash
# Stop bot (SIGTERM — graceful shutdown)
kill -TERM <bot_pid>

# Update address
vim bot/.env   # CONTRACT_ADDRESS=0xNEW...

# Clear last processed block (force full event rescan)
# In SQLite: UPDATE metadata SET last_processed_block = 0;
sqlite3 bot/data/willchain.db "UPDATE metadata SET last_processed_block = 0;"

# Restart
cd bot && node src/index.js
```

---

## Health Monitoring

### Check bot health

```bash
curl -s http://localhost:3001/health | jq .
# Expected: { "ok": true, "bot": true, "contract": true, "uptime": 3600, ... }
# If "contract": false → RPC issue, check RPC_URL in bot/.env
# If "bot": false → Telegram token issue or bot crashed during init
# HTTP 503 → bot or contract not ready
```

### Check last processed block

```bash
sqlite3 bot/data/willchain.db "SELECT * FROM metadata;"
# OR check /health response field "lastEventBlock"
```

### Verify event catch-up is working

```bash
# Bot logs on startup show:
# [INFO] Catching up from block XXXXX to YYYYY
# [INFO] Processed N events during catch-up
```

---

## Alert SLA

| Status | Expected alert delay | Action if missed |
|--------|---------------------|------------------|
| GRACE period entered | ≤ 24h (daily cron at 09:00 UTC) | Check bot logs, restart if needed |
| ABANDONED | ≤ 24h | Same |
| Approaching inactivity (≤7d) | ≤ 7 days (weekly cron) | Check bot logs |
| Event: claim initiated | ≤ 5 min (real-time listener) | Check RPC connectivity |

---

## Incident Response

### Bot not sending alerts

1. Check process: `ps aux | grep node`
2. Check logs: `journalctl -u willchain-bot -n 100` (if systemd)
3. Check health: `curl http://localhost:3001/health`
4. Check RPC: `curl -X POST $RPC_URL -d '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}'`
5. If RPC down → switch to backup RPC in bot/.env, restart bot
6. If bot crashed → check error logs, restart: `node bot/src/index.js`

### Alert mismatch (wrong status shown)

1. Verify contract state directly:
   ```bash
   cd /path/to/willchain.net
   npx hardhat run scripts/check-stats.js --network baseSepolia
   ```
2. Compare with bot's `/status` response in Telegram
3. If mismatch → likely stale RPC response; restart bot to force reconnect

### Bot missed events while down

On restart, bot automatically catches up from `last_processed_block` in SQLite.
If that value is corrupt:
```bash
sqlite3 bot/data/willchain.db \
  "UPDATE metadata SET last_processed_block = <DEPLOYMENT_BLOCK>;"
```
Then restart — bot will rescan all events from deployment.

### Database corruption

```bash
# Backup first
cp bot/data/willchain.db bot/data/willchain.db.bak.$(date +%s)

# Check integrity
sqlite3 bot/data/willchain.db "PRAGMA integrity_check;"

# If corrupt, restore from backup or rebuild from events
sqlite3 bot/data/willchain.db ".dump" > dump.sql
# Fix dump.sql manually if needed, then:
sqlite3 bot/data/willchain_new.db < dump.sql
```

---

## Key Rotation

### Telegram Bot Token

1. Get new token from @BotFather
2. Update `TELEGRAM_BOT_TOKEN` in `bot/.env`
3. Restart bot

### RPC Provider Key

1. Update `RPC_URL` in `bot/.env`
2. Restart bot
3. Verify: `curl http://localhost:3001/health` → `"contract": true`

### Treasury Address (multisig)

1. Deploy new Safe at https://app.safe.global
2. As owner, call `contract.proposeTreasuryChange(newAddress)` — starts the 2-day timelock
3. Wait 48 hours (timelock cannot be bypassed)
4. Call `contract.executeTreasuryChange()` — applies the change
5. To cancel before execution: call `contract.cancelTreasuryChange()`
6. Update `TREASURY_ADDRESS` in `.env` for future deploys

> **Note:** `setProtocolTreasury()` no longer exists. The only path is the 2-day timelock.
> Attempting to call the old function will revert.

---

## nginx / Caddy Config (reference)

```nginx
# nginx example
server {
    server_name willchain.net;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        # Do NOT expose X-Forwarded-For unless TRUST_PROXY=true in bot/.env
    }

    location / {
        root /path/to/willchain.net/frontend-react/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## systemd Unit (reference)

```ini
[Unit]
Description=WillChain Telegram Bot
After=network.target

[Service]
Type=simple
User=willchain
WorkingDirectory=/path/to/willchain.net/bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/path/to/willchain.net/bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable willchain-bot
systemctl start willchain-bot
journalctl -u willchain-bot -f
```

---

## RPC Failover

### Provider priority

| Priority | Provider   | Notes                              |
|----------|------------|------------------------------------|
| Primary  | Alchemy    | Base Sepolia, highest reliability  |
| Backup 1 | Infura     | Base Sepolia support               |
| Backup 2 | QuickNode  | Base Sepolia support               |

> Keep at least two RPC URLs ready. Store the backup in a comment in `bot/.env`:
> ```
> RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
> # RPC_URL_BACKUP=https://base-sepolia.infura.io/v3/YOUR_KEY
> ```

### Switching procedure

```bash
# 1. Test the new RPC before switching
curl -s -X POST https://NEW_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}'
# Expected: {"jsonrpc":"2.0","id":1,"result":"0x..."}

# 2. Stop bot gracefully
kill -TERM <bot_pid>

# 3. Update bot/.env
vim bot/.env   # RPC_URL=https://NEW_RPC_URL

# 4. Restart bot
cd bot && node src/index.js

# 5. Verify health
curl -s http://localhost:3001/health | jq .
# Confirm: "contract": true, "blockLagAlert": false
```

### Diagnosing RPC issues

```bash
# Check current block number
curl -s -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}' | jq .

# Check if node is syncing
curl -s -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"method":"eth_syncing","params":[],"id":1,"jsonrpc":"2.0"}' | jq .
# Expected: {"result": false} (fully synced)
```

---

## Post-Restart Validation Checklist

After **any** bot restart (deploy, crash recovery, RPC switch), verify all of the following:

| # | Check | Command / Method | Expected |
|---|-------|-----------------|----------|
| 1 | Health endpoint | `curl -s http://localhost:3001/health \| jq .` | HTTP 200, all components `true` |
| 2 | Block lag | Check `blockLagAlert` in health response | `false` |
| 3 | Last event block | Check `lastEventBlock` in health response | Within ~10 minutes of current block |
| 4 | Telegram works | Send `/status` from a linked Telegram account | Bot responds with vault status |
| 5 | No error lines | `journalctl -u willchain-bot -n 50` | No `[ERROR]` lines after startup |
| 6 | Event catch-up | Check startup logs for catch-up messages | `Processed N events during catch-up` |

> **Tip:** If step 3 shows a stale block, the bot may have started before the RPC was reachable.
> Restart the bot again after confirming RPC connectivity (see [RPC Failover](#rpc-failover)).

---

## Monitoring Setup

### UptimeRobot (recommended)

1. Create an HTTP(S) monitor for `https://willchain.net/api/health`
2. Check interval: **5 minutes**
3. Alert on: HTTP status `503`, timeout, or connection error
4. Alert contacts: Telegram channel or email

### Alert conditions

| Condition | Meaning | Action |
|-----------|---------|--------|
| HTTP 503 | Bot or contract not ready | See [Incident Response](#incident-response) |
| Timeout (>10s) | Server unreachable | Check VPS, nginx, bot process |
| `blockLagAlert: true` | No new block in >10 min | Switch RPC provider |

### Telegram alert channel

1. Create a private Telegram channel for ops alerts
2. Add UptimeRobot bot or webhook integration
3. Consider a separate bot token for monitoring (not the main WillChain bot)

### Future: Grafana + Prometheus

- Expose `/metrics` endpoint from bot (planned)
- Track: events processed/min, health check latency, RPC response time
- Dashboards for block lag, linked users count, alert delivery rate

---

## Capacity Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| SQLite `processed_events` | ~1M events comfortably | Auto-cleanup runs every 6h |
| SQLite `rate_limits` | Persistent across restarts | Cleanup runs every 5 min |
| Rate limiting (API) | 30 req/min per IP | Resets on bot restart (in-memory counter) |
| Telegram API | ~30 messages/sec per bot | Telegram-imposed; burst above this is queued |
| Event catch-up | 500,000 blocks max per startup | `MAX_CATCHUP_BLOCKS` constant; if gap is larger, multiple restarts needed |
| SQLite DB file size | ~100MB practical limit | Well within limits for expected usage |

### If catch-up gap exceeds MAX_CATCHUP_BLOCKS

```bash
# Bot will log a warning with the exact block range
# After first restart, it catches up 500k blocks
# Check last_processed_block:
sqlite3 bot/data/willchain.db "SELECT * FROM metadata;"
# If still behind, restart again — each restart advances 500k blocks
```

---

## Emergency Procedures

### Critical Bug in Contract

> **No pause mechanism exists** — this is by design to prevent censorship.

1. **Assess severity:** Can users lose funds? Is the bug exploitable right now?
2. **If exploitable:** Act immediately — there is no on-chain kill switch
3. **Deploy new contract:**
   ```bash
   # Update contract code with fix
   npm run deploy:base-sepolia
   # New address in deployments/baseSepolia-latest.json
   ```
4. **Update all references:**
   - `bot/.env` → `CONTRACT_ADDRESS=0xNEW...`
   - `shared/contract-config.js` → update address
   - Frontend rebuild: `cd frontend-react && npm run build`
5. **Notify users:** Broadcast via bot to all linked Telegram users
6. **Migration:** Users must re-register on the new contract (no automatic migration)
7. **Post-mortem:** Document root cause, write regression test

### Bot Compromise (leaked Telegram token)

```bash
# 1. Revoke token IMMEDIATELY
# Open Telegram → @BotFather → /revoke → select bot → confirm

# 2. Generate new token
# @BotFather → /token → select bot → copy new token

# 3. Audit database for unauthorized changes
sqlite3 bot/data/willchain.db ".dump users"
sqlite3 bot/data/willchain.db "SELECT * FROM users ORDER BY rowid DESC LIMIT 20;"

# 4. Update and restart
vim bot/.env   # TELEGRAM_BOT_TOKEN=NEW_TOKEN
kill -TERM <bot_pid>
cd bot && node src/index.js

# 5. Verify
curl -s http://localhost:3001/health | jq .bot
# Expected: true
```

> **Note:** A compromised bot token allows sending messages as the bot and reading
> incoming messages, but does NOT grant access to the contract or private keys.

### RPC Provider Compromise

1. **Switch `RPC_URL` immediately** (see [RPC Failover](#rpc-failover))
2. **Verify contract state** matches expectations:
   ```bash
   # Compare on Basescan directly
   # https://sepolia.basescan.org/address/<CONTRACT_ADDRESS>
   npx hardhat run scripts/check-stats.js --network baseSepolia
   ```
3. **Audit sent alerts:** Check if false alerts were sent during the compromised period
   ```bash
   # Review bot logs for the affected time window
   journalctl -u willchain-bot --since "2h ago" | grep -i "alert\|notify\|send"
   ```
4. **Notify affected users** if false alerts were delivered

---

## Decision Trees

### `/health` returns HTTP 503

```
/health returns 503?
  │
  ├── "bot": false
  │     └── Telegram token invalid or bot init failed
  │           → Check logs: journalctl -u willchain-bot -n 50
  │           → If token issue: revoke + regenerate (see Bot Compromise)
  │           → If init crash: check error, fix, restart
  │
  ├── "contract": false
  │     └── Cannot reach contract via RPC
  │           → Test RPC: curl -X POST $RPC_URL -d '{"method":"eth_blockNumber",...}'
  │           → If RPC down: switch provider (see RPC Failover)
  │           → If RPC ok: check CONTRACT_ADDRESS in bot/.env
  │
  ├── "blockLagAlert": true
  │     └── No new block received in >10 minutes
  │           → RPC node is stuck or behind
  │           → Switch to backup RPC provider
  │           → Verify new provider returns current block
  │
  └── "rpc": false
        └── Network-level issue
              → Check internet: ping 8.8.8.8
              → Check DNS: nslookup base-sepolia.g.alchemy.com
              → If local network ok: RPC provider is down → switch provider
```

### Bot is running but not sending alerts

```
Bot running, no alerts?
  │
  ├── /health returns 200, all true?
  │     ├── Yes → Check if events are actually happening on-chain
  │     │         → npx hardhat run scripts/check-stats.js --network baseSepolia
  │     │         → If events exist: check last_processed_block in SQLite
  │     │         → If stale: restart bot to trigger catch-up
  │     │
  │     └── No → See "/health returns 503" tree above
  │
  ├── User linked?
  │     → Send /start to bot, check if wallet is linked
  │     → If not linked: user must complete /link flow
  │
  └── Cron job timing?
        → Daily cron runs at 09:00 UTC
        → Weekly cron runs once per week
        → Real-time events: should alert within ~5 min
        → See Alert SLA table in Incident Response section
```
