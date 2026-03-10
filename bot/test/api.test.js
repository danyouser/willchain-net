/**
 * API server tests — spins up the HTTP server on a random port
 * with a mock DB, then fires real HTTP requests.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// ── Minimal mock DB ──
const mockDb = {
  _successors: {},
  getOwnersBySuccessor(addr) {
    return this._successors[addr.toLowerCase()] || [];
  },
};

// ── Build the server inline (mirrors api.js logic) ──
const ALLOWED_ORIGIN = 'https://willchain.net';
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map();

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

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (isRateLimited(ip)) return sendJson(res, 429, { error: 'Too many requests' });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    return res.end();
  }

  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  const match = req.url.match(/^\/successors\/(0x[0-9a-fA-F]{40})$/i);
  if (match) {
    const owners = mockDb.getOwnersBySuccessor(match[1]);
    return sendJson(res, 200, { owners });
  }

  if (req.url === '/health') return sendJson(res, 200, { ok: true });

  sendJson(res, 404, { error: 'Not found' });
});

// ── Helpers ──
let BASE;

function request(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method, headers }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || 'null') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// Each test gets a unique IP to avoid cross-test rate limiting
let ipCounter = 1;
function uniqueIp() { return `10.0.${Math.floor(ipCounter / 255)}.${ipCounter++ % 255 + 1}`; }
function get(path, headers) { return request('GET', path, { 'x-forwarded-for': uniqueIp(), ...headers }); }
function post(path) { return request('POST', path, { 'x-forwarded-for': uniqueIp() }); }
function options(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'OPTIONS', headers: { 'x-forwarded-for': uniqueIp() } }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(() => new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => {
    BASE = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise(resolve => server.close(resolve)));

// ── Test suites ──

describe('GET /health', () => {
  test('returns 200 ok', async () => {
    const r = await get('/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });
});

describe('GET /successors/:address', () => {
  test('returns empty array for unknown successor', async () => {
    const addr = '0x' + 'a'.repeat(40);
    const r = await get(`/successors/${addr}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.owners, []);
  });

  test('returns owners for known successor', async () => {
    const succ = '0x' + 'b'.repeat(40);
    const owner = '0x' + 'c'.repeat(40);
    mockDb._successors[succ.toLowerCase()] = [owner];
    const r = await get(`/successors/${succ}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.owners, [owner]);
  });

  test('lookup is case-insensitive', async () => {
    const succ = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    mockDb._successors[succ.toLowerCase()] = ['0xowner'];
    const r = await get(`/successors/${succ.toUpperCase()}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.owners.length, 1);
  });

  test('returns 404 for invalid address format', async () => {
    const r = await get('/successors/not-an-address');
    assert.equal(r.status, 404);
  });

  test('returns 404 for address too short', async () => {
    const r = await get('/successors/0x1234');
    assert.equal(r.status, 404);
  });
});

describe('CORS headers', () => {
  test('GET response includes Access-Control-Allow-Origin', async () => {
    const r = await get('/health');
    assert.equal(r.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
  });

  test('OPTIONS preflight returns 204 with CORS headers', async () => {
    const r = await options('/health');
    assert.equal(r.status, 204);
    assert.equal(r.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
    assert.ok(r.headers['access-control-allow-methods'].includes('GET'));
  });
});

describe('Method validation', () => {
  test('POST returns 405', async () => {
    const r = await post('/health');
    assert.equal(r.status, 405);
  });
});

describe('Rate limiting', () => {
  test('returns 429 after exceeding limit from same IP', async () => {
    // Reset rate limit map for clean test
    rateLimitMap.clear();
    // Use x-forwarded-for to simulate a unique IP
    const ip = '10.0.0.99';
    const headers = { 'x-forwarded-for': ip };

    // First RATE_LIMIT requests should succeed
    for (let i = 0; i < RATE_LIMIT; i++) {
      const r = await get('/health', headers);
      assert.notEqual(r.status, 429, `Request ${i + 1} should not be rate limited`);
    }

    // Next request should be rate limited
    const r = await get('/health', headers);
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'Too many requests');
  });

  test('different IPs have independent rate limit counters', async () => {
    rateLimitMap.clear();
    const ip1 = '10.0.1.1';
    const ip2 = '10.0.1.2';

    // Exhaust limit for ip1
    for (let i = 0; i < RATE_LIMIT; i++) {
      await get('/health', { 'x-forwarded-for': ip1 });
    }
    const r1 = await get('/health', { 'x-forwarded-for': ip1 });
    assert.equal(r1.status, 429);

    // ip2 should still be fine
    const r2 = await get('/health', { 'x-forwarded-for': ip2 });
    assert.notEqual(r2.status, 429);
  });
});

describe('404 for unknown routes', () => {
  test('unknown path returns 404', async () => {
    const r = await get('/unknown/path');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'Not found');
  });
});

describe('TRUST_PROXY behaviour', () => {
  test('when TRUST_PROXY=false, x-forwarded-for does not bypass per-IP rate limit', async () => {
    // Build a minimal server that does NOT trust x-forwarded-for
    const trustProxyMap = new Map();
    const LIMIT = 3;

    function isLimited(ip) {
      const now = Date.now();
      const e = trustProxyMap.get(ip);
      if (!e || now - e.ts > 60_000) { trustProxyMap.set(ip, { ts: now, count: 1 }); return false; }
      if (e.count >= LIMIT) return true;
      e.count++;
      return false;
    }

    const srv = http.createServer((req, res) => {
      // TRUST_PROXY=false: always use socket IP, ignore x-forwarded-for
      const ip = req.socket.remoteAddress;
      if (isLimited(ip)) { res.writeHead(429); res.end('{}'); return; }
      res.writeHead(200); res.end('{"ok":true}');
    });

    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;

    function reqTo(xfwdFor) {
      return new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: srv.address().port, path: '/health', method: 'GET',
            headers: xfwdFor ? { 'x-forwarded-for': xfwdFor } : {} },
          res => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)); }
        );
        req.on('error', reject);
        req.end();
      });
    }

    // Exhaust limit using different forged x-forwarded-for headers
    // They should NOT help because server ignores the header
    for (let i = 0; i < LIMIT; i++) {
      const status = await reqTo(`10.0.${i}.1`);
      assert.notEqual(status, 429, `Request ${i + 1} should not be rate limited`);
    }
    // Next request from same socket IP should be rate limited regardless of x-forwarded-for
    const status = await reqTo('1.2.3.4'); // forge a different IP — should still be limited
    assert.equal(status, 429, 'Should be rate limited by real socket IP, not x-forwarded-for');

    await new Promise(r => srv.close(r));
  });
});
