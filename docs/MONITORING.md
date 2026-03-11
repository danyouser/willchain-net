# Production Monitoring Setup

## UptimeRobot (Free Tier — 50 monitors, 5-min intervals)

Sign up at [uptimerobot.com](https://uptimerobot.com) and create these monitors:

### Monitor 1: Frontend
- Type: **HTTP(s)**
- URL: `https://willchain.net`
- Interval: 5 minutes
- Alert: email / Telegram

### Monitor 2: Bot API Health
- Type: **HTTP(s) — Keyword**
- URL: `https://api.willchain.net/health`
- Keyword: `"ok":true`
- Interval: 5 minutes
- Alert: email / Telegram

This catches: API down, bot crash, RPC disconnection, event listener stuck (blockLagAlert).

### Monitor 3: SSL Certificate
- Type: **HTTP(s)**
- URL: `https://api.willchain.net`
- SSL expiry alert: 14 days
- Interval: 24 hours

### Optional: Monitor 4: Bot Telegram
- Type: **HTTP(s)**
- URL: `https://api.telegram.org/bot<TOKEN>/getMe`
- Keyword: `"ok":true`
- Interval: 30 minutes

## Health Endpoint Reference

`GET https://api.willchain.net/health` returns:

```json
{
  "ok": true,
  "uptime": 3600,
  "bot": true,
  "contract": true,
  "rpc": true,
  "rpcBlock": 38723171,
  "lastEventBlock": 38723163,
  "blockLagMs": 14910,
  "blockLagAlert": false,
  "ts": "2026-03-11T07:37:10.538Z"
}
```

| Field | Meaning | Alert if |
|-------|---------|----------|
| `ok` | Overall health | `false` |
| `bot` | Telegram bot connected | `false` |
| `contract` | Contract listener active | `false` |
| `rpc` | RPC provider responding | `false` |
| `blockLagMs` | Time since last event block | > 600,000 (10 min) |
| `blockLagAlert` | Auto-detected lag | `true` |

HTTP status: `200` = healthy, `503` = degraded.

## UptimeRobot Telegram Integration

1. UptimeRobot → My Settings → Alert Contacts → Add
2. Type: Telegram
3. Follow the bot link to authorize
4. Assign this contact to all monitors

## Incident Response

When an alert fires:

### API/Bot Down
```bash
ssh root@5.45.66.229
systemctl status willchain-bot
journalctl -u willchain-bot --since "10 min ago" --no-pager
systemctl restart willchain-bot
```

### Event Listener Stuck (blockLagAlert)
Usually caused by RPC `filter not found`. Restart fixes it:
```bash
systemctl restart willchain-bot
```

### RPC Down
Check provider status page. If persistent, switch RPC in `.env`:
```bash
vi /opt/willchain-net/bot/.env
# Change RPC_URL to backup provider
systemctl restart willchain-bot
```

### Frontend Down
Check Cloudflare Pages dashboard → Deployments. Usually auto-recovers.

### SSL/Certificate Issues
Cloudflare manages frontend SSL. For API:
```bash
# Check cert expiry
openssl x509 -in /etc/nginx/ssl/willchain.crt -noout -dates
# Regenerate if needed
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/willchain.key \
  -out /etc/nginx/ssl/willchain.crt \
  -subj "/CN=api.willchain.net"
systemctl reload nginx
```
