/**
 * Tests for bot pure utility functions:
 * - isRateLimited (Telegram command rate limiter)
 * - emailRegex (email validation)
 * - log (message formatting)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Inline the pure functions under test (mirrors bot/src/index.js) ──

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

function makeRateLimiter() {
  const rateLimits = new Map();
  return function isRateLimited(userId) {
    const now = Date.now();
    const entry = rateLimits.get(userId);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimits.set(userId, { count: 1, windowStart: now });
      return false;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
  };
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO: '📋',
    WARN: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
    EVENT: '📡',
  }[level] || '•';
  return `[${timestamp}] ${prefix} ${message}`;
}

// ── isRateLimited ──
describe('Bot isRateLimited', () => {
  test('first call returns false (not limited)', () => {
    const isRateLimited = makeRateLimiter();
    assert.equal(isRateLimited(1), false);
  });

  test('allows up to RATE_LIMIT_MAX (10) calls', () => {
    const isRateLimited = makeRateLimiter();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      assert.equal(isRateLimited(42), false, `call ${i + 1} should not be limited`);
    }
  });

  test('returns true on 11th call (exceeds limit)', () => {
    const isRateLimited = makeRateLimiter();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) isRateLimited(99);
    assert.equal(isRateLimited(99), true);
  });

  test('different userIds have independent counters', () => {
    const isRateLimited = makeRateLimiter();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) isRateLimited(1);
    assert.equal(isRateLimited(1), true);
    assert.equal(isRateLimited(2), false); // user 2 is independent
  });

  test('window resets after RATE_LIMIT_WINDOW_MS', () => {
    // Simulate expired window by setting a very old windowStart
    const rateLimits = new Map();
    rateLimits.set(7, { count: RATE_LIMIT_MAX + 5, windowStart: Date.now() - RATE_LIMIT_WINDOW_MS - 1 });

    function isRateLimited(userId) {
      const now = Date.now();
      const entry = rateLimits.get(userId);
      if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimits.set(userId, { count: 1, windowStart: now });
        return false;
      }
      entry.count++;
      if (entry.count > RATE_LIMIT_MAX) return true;
      return false;
    }

    // window has expired → should reset and not be limited
    assert.equal(isRateLimited(7), false);
  });
});

// ── emailRegex ──
describe('emailRegex validation', () => {
  test('accepts standard email', () => {
    assert.ok(emailRegex.test('user@example.com'));
  });

  test('accepts subdomain email', () => {
    assert.ok(emailRegex.test('user@mail.example.com'));
  });

  test('accepts email with dots in local part', () => {
    assert.ok(emailRegex.test('first.last@example.com'));
  });

  test('accepts email with plus sign', () => {
    assert.ok(emailRegex.test('user+tag@example.com'));
  });

  test('accepts short TLD', () => {
    assert.ok(emailRegex.test('a@b.io'));
  });

  test('rejects email without @', () => {
    assert.ok(!emailRegex.test('userexample.com'));
  });

  test('rejects email without domain', () => {
    assert.ok(!emailRegex.test('user@'));
  });

  test('rejects email without TLD', () => {
    assert.ok(!emailRegex.test('user@example'));
  });

  test('rejects email starting with @', () => {
    assert.ok(!emailRegex.test('@example.com'));
  });

  test('rejects email with spaces', () => {
    assert.ok(!emailRegex.test('user name@example.com'));
  });

  test('rejects email with space in domain', () => {
    assert.ok(!emailRegex.test('user@exam ple.com'));
  });

  test('rejects empty string', () => {
    assert.ok(!emailRegex.test(''));
  });
});

// ── log format ──
describe('log message format', () => {
  test('INFO level uses 📋 prefix', () => {
    const msg = log('INFO', 'test message');
    assert.ok(msg.includes('📋'));
    assert.ok(msg.includes('test message'));
  });

  test('WARN level uses ⚠️ prefix', () => {
    assert.ok(log('WARN', 'x').includes('⚠️'));
  });

  test('ERROR level uses ❌ prefix', () => {
    assert.ok(log('ERROR', 'x').includes('❌'));
  });

  test('SUCCESS level uses ✅ prefix', () => {
    assert.ok(log('SUCCESS', 'x').includes('✅'));
  });

  test('EVENT level uses 📡 prefix', () => {
    assert.ok(log('EVENT', 'x').includes('📡'));
  });

  test('unknown level uses • prefix', () => {
    assert.ok(log('DEBUG', 'x').includes('•'));
  });

  test('message is included in output', () => {
    const msg = log('INFO', 'hello world');
    assert.ok(msg.includes('hello world'));
  });

  test('output contains ISO timestamp in brackets', () => {
    const msg = log('INFO', 'x');
    assert.match(msg, /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
