# WillChain — Beta Deploy Guide

Step-by-step instructions to deploy WillChain for testnet beta.

**Architecture:**
- Frontend → Cloudflare Pages (willchain.net)
- Bot + API → VPS (api.willchain.net)
- Contract → already deployed on Base Sepolia

---

## Prerequisites

- [ ] Cloudflare account with `willchain.net` domain
- [ ] VPS with Ubuntu 22+ and Node.js 20
- [ ] Telegram bot token (from @BotFather)
- [ ] WalletConnect project ID (https://cloud.reown.com)
- [ ] Git repo access

---

## Step 1: Frontend → Cloudflare Pages

### 1.1 Create project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Select **Pages** → **Connect to Git**
3. Choose your repository

### 1.2 Build settings

| Setting | Value |
|---------|-------|
| Framework preset | None |
| Build command | `cd frontend-react && npm install && npm run build` |
| Build output directory | `frontend-react/dist` |
| Root directory | `/` (default) |
| Node.js version | `20` |

### 1.3 Environment variables

| Variable | Value |
|----------|-------|
| `VITE_BOT_API_URL` | `https://api.willchain.net` |
| `VITE_WALLETCONNECT_PROJECT_ID` | Your WalletConnect project ID |
| `NODE_VERSION` | `20` |

### 1.4 Custom domain

1. Pages project → **Custom domains** → **Set up a custom domain**
2. Enter `willchain.net`
3. Cloudflare will auto-configure DNS

### 1.5 Verify

Open `https://willchain.net` — the landing page should load.

---

## Step 2: Bot + API → VPS

### 2.1 Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # should show v20.x
```

### 2.2 Clone and install

```bash
cd /home/ubuntu
git clone <your-repo-url> willchain.net
cd willchain.net/bot
npm install --omit=dev
mkdir -p data
```

### 2.3 Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in:

```env
TELEGRAM_BOT_TOKEN=your_token_here
CONTRACT_ADDRESS=0x6fAd1475B41731E3eDA21998417Cb2e18E795877
RPC_URL=https://sepolia.base.org
FRONTEND_URL=https://willchain.net
EXPLORER_URL=https://sepolia.basescan.org
DEPLOYMENT_BLOCK=0
API_PORT=3001
TRUST_PROXY=true
```

> **Important:** Set `DEPLOYMENT_BLOCK` to the block where the contract was deployed.
> Find it on [BaseScan Sepolia](https://sepolia.basescan.org/address/0x6fAd1475B41731E3eDA21998417Cb2e18E795877).

### 2.4 Test manually

```bash
node src/index.js
# Should see: "API server listening on 127.0.0.1:3001"
# Should see: "Bot started"
# Ctrl+C to stop
```

### 2.5 Install as systemd service

```bash
sudo cp /home/ubuntu/willchain.net/deploy/willchain-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now willchain-bot
```

Verify:

```bash
sudo systemctl status willchain-bot
curl -s http://127.0.0.1:3001/health | jq
```

### 2.6 Logs

```bash
journalctl -u willchain-bot -f           # live tail
journalctl -u willchain-bot --since "1h" # last hour
sudo systemctl restart willchain-bot     # restart if needed
```

---

## Step 3: Nginx reverse proxy

### 3.1 Install nginx

```bash
sudo apt-get install -y nginx
```

### 3.2 Copy config

```bash
sudo cp /home/ubuntu/willchain.net/deploy/nginx.conf /etc/nginx/sites-available/willchain-api
sudo ln -s /etc/nginx/sites-available/willchain-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # remove default site
```

### 3.3 SSL certificate

**Option A: Cloudflare Origin Certificate (recommended)**

1. Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
2. Hostnames: `api.willchain.net`
3. Save certificate and key to VPS:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/willchain-origin.pem      # paste certificate
sudo nano /etc/ssl/cloudflare/willchain-origin-key.pem   # paste key
sudo chmod 600 /etc/ssl/cloudflare/willchain-origin-key.pem
```

**Option B: Let's Encrypt**

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.willchain.net
```

Then update `deploy/nginx.conf` to use Let's Encrypt paths (commented out in config).

### 3.4 Enable and test

```bash
sudo nginx -t                    # check config syntax
sudo systemctl reload nginx
curl -s https://api.willchain.net/health | jq
```

---

## Step 4: DNS (Cloudflare)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api` | `<VPS_IP>` | Proxied (orange cloud) |

> `willchain.net` DNS is auto-configured by Cloudflare Pages.

---

## Step 5: Verify everything

```bash
# Frontend
curl -sI https://willchain.net | head -5
# Should return: HTTP/2 200

# Bot API health
curl -s https://api.willchain.net/health | jq
# Should return: { "status": "ok", "uptime": ..., "bot": "running", ... }

# Telegram bot
# Send /start to your bot in Telegram
# Should respond with welcome message
```

---

## Step 6: Send test tokens

From your deployer wallet, transfer WILL tokens to beta testers:

```bash
# Using Hardhat console or a script
cd /home/ubuntu/willchain.net
npx hardhat console --network baseSepolia
```

```javascript
const token = await ethers.getContractAt("WillChain", "0x6fAd1475B41731E3eDA21998417Cb2e18E795877");
await token.transfer("0xTESTER_ADDRESS", ethers.parseEther("100"));
```

Or use the frontend: connect deployer wallet → transfer via UI.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot won't start | Check `.env` values, especially `TELEGRAM_BOT_TOKEN` |
| API returns 502 | Bot not running: `sudo systemctl status willchain-bot` |
| Frontend can't reach API | Check CORS: `FRONTEND_URL` in bot `.env` must match exactly |
| Health returns `blockLagAlert: true` | RPC provider issue — check `RPC_URL` |
| Events not processing | Check `DEPLOYMENT_BLOCK` — should be contract creation block |

---

## Updating

```bash
cd /home/ubuntu/willchain.net
git pull
cd bot && npm install --omit=dev
sudo systemctl restart willchain-bot

# Frontend: Cloudflare Pages auto-deploys on git push
```
