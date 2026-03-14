/**
 * WillChain Bot — HTTP API
 * Exposes successor relationship data and wallet link verification.
 */

const http = require('http');
const { ethers } = require('ethers');
const db = require('./database');
const { verifyWalletLinkSignature } = require('./eip712');
const { t } = require('./i18n');

const PORT = process.env.API_PORT || 3001;
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'https://willchain.net';
// Only trust x-forwarded-for when explicitly running behind a reverse proxy
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

// Simple in-memory rate limiter: max 30 requests per minute per IP
const rateLimitMap = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { ts: now, count: 1 });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.ts > RATE_WINDOW_MS) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const MAX_BODY_BYTES = 1024; // 1 KB — sufficient for { tgid, addr, nonce, sig }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return reject(new Error('Payload too large'));
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

let _bot = null;
let _provider = null;
let _startTime = Date.now();
let _lastEventBlock = 0;
let _lastEventBlockTs = null; // timestamp when _lastEventBlock was last updated
let _contractOk = false;

// Alert if no new blocks processed for this long (event listener may be stuck)
const BLOCK_LAG_ALERT_MS = 10 * 60_000; // 10 minutes

/** Called by index.js to report contract connectivity status */
function reportContractStatus(ok, lastBlock) {
  _contractOk = ok;
  if (lastBlock) {
    _lastEventBlock = lastBlock;
    _lastEventBlockTs = Date.now();
  }
}

/** Called by index.js each time a new event block is processed (real-time listeners) */
function reportEventBlock(blockNumber) {
  if (blockNumber > _lastEventBlock) {
    _lastEventBlock = blockNumber;
    _lastEventBlockTs = Date.now();
  }
}

/** Called by index.js to register the ethers provider for active RPC health checks */
function reportProvider(provider) {
  _provider = provider;
}

const server = http.createServer(async (req, res) => {
  const ip = (TRUST_PROXY && req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    console.warn(`[API] rate-limited ip=${ip} url=${req.url}`);
    return sendJson(res, 429, { error: 'Too many requests' });
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // POST /verify-link — EIP-712 wallet link verification
  if (req.method === 'POST' && req.url === '/verify-link') {
    let body;
    try { body = await readBody(req); }
    catch (e) {
      const status = e.message === 'Payload too large' ? 413 : 400;
      return sendJson(res, status, { error: e.message });
    }

    const { tgid, addr, nonce, sig } = body || {};

    if (!tgid || !addr || !nonce || !sig) {
      return sendJson(res, 400, { error: 'Missing required fields: tgid, addr, nonce, sig' });
    }

    // Type validation
    if (typeof tgid !== 'string' && typeof tgid !== 'number') {
      return sendJson(res, 400, { error: 'Invalid tgid type' });
    }
    if (typeof nonce !== 'string' || !/^0x[0-9a-f]{64}$/i.test(nonce)) {
      return sendJson(res, 400, { error: 'Invalid nonce format' });
    }
    if (typeof sig !== 'string' || !/^0x[0-9a-f]{130}$/i.test(sig)) {
      return sendJson(res, 400, { error: 'Invalid signature format' });
    }
    if (!ethers.isAddress(addr)) {
      return sendJson(res, 400, { error: 'Invalid Ethereum address' });
    }

    const challenge = db.getChallenge(tgid);
    if (!challenge) {
      console.warn(`[API] verify-link: challenge not found for tgid=${tgid} ip=${ip}`);
      return sendJson(res, 400, { error: 'Challenge not found or expired. Start again with /link' });
    }
    if (challenge.walletAddress.toLowerCase() !== addr.toLowerCase() || challenge.nonce !== nonce) {
      console.warn(`[API] verify-link: challenge mismatch tgid=${tgid} ip=${ip}`);
      return sendJson(res, 400, { error: 'Challenge mismatch' });
    }

    const result = verifyWalletLinkSignature(addr, tgid, nonce, sig);
    if (!result.ok) {
      console.warn(`[API] verify-link: signature failed reason=${result.reason} tgid=${tgid} ip=${ip}`);
      return sendJson(res, 400, { error: result.reason });
    }

    // Use lang saved with the challenge (from /link command context)
    const lang = challenge.lang || 'en';
    db.deleteChallenge(tgid);
    db.saveUser(tgid, addr, true, lang);
    console.log(`[API] verify-link: success tgid=${tgid} addr=${addr.slice(0, 10)}...`);

    if (_bot) {
      try {
        const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        await _bot.api.sendMessage(tgid,
          t(lang, 'api.verify_success', { address: shortAddr }),
          { parse_mode: 'Markdown' }
        );
      } catch { /* Telegram notification failure is non-fatal */ }
    }

    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  // GET /successors/:address — list of owner wallets where :address is successor
  const match = req.url.match(/^\/successors\/(0x[0-9a-fA-F]{40})$/i);
  if (match) {
    const normalizedAddr = match[1].toLowerCase();
    const owners = db.getOwnersBySuccessor(normalizedAddr);
    return sendJson(res, 200, { owners });
  }

  // GET /health — detailed liveness/readiness check (includes active RPC ping)
  if (req.url === '/health') {
    const uptimeSeconds = Math.floor((Date.now() - _startTime) / 1000);
    const blockLagMs = _lastEventBlockTs ? Date.now() - _lastEventBlockTs : null;
    const blockLagAlert = _contractOk && _lastEventBlockTs !== null && blockLagMs > BLOCK_LAG_ALERT_MS;

    // Active RPC ping: attempt getBlockNumber() to detect hung providers
    let rpcOk = false;
    let rpcBlock = null;
    if (_provider) {
      try {
        rpcBlock = await _provider.getBlockNumber();
        rpcOk = true;
      } catch {
        rpcOk = false;
      }
    }

    const ok = !blockLagAlert && rpcOk !== false;
    const payload = {
      ok,
      uptime: uptimeSeconds,
      bot: _bot !== null,
      contract: _contractOk,
      rpc: _provider ? rpcOk : null,
      rpcBlock,
      lastEventBlock: _lastEventBlock || null,
      blockLagMs: blockLagMs !== null ? Math.floor(blockLagMs) : null,
      blockLagAlert,
      ts: new Date().toISOString(),
    };
    // Return 503 if critical components are not ready, event listener is stuck, or RPC is down
    const status = (_bot && _contractOk && !blockLagAlert && (_provider ? rpcOk : true)) ? 200 : 503;
    return sendJson(res, status, payload);
  }

  sendJson(res, 404, { error: 'Not found' });
});

function startApi(bot) {
  _bot = bot || null;
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[API] HTTP server listening on 127.0.0.1:${PORT}`);
  });
}

module.exports = { startApi, reportContractStatus, reportEventBlock, reportProvider, server };
