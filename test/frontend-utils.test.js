/**
 * Frontend utility function tests (pure functions, no DOM/wallet needed)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Inline the pure functions under test ──

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Mirrors app.js: Math.floor(parseFloat(ethers.formatEther(amount))).toLocaleString('en-US')
// We replicate the ethers.formatEther logic: divide by 1e18
function formatTokenAmount(amount) {
  const num = Math.floor(parseFloat((BigInt(amount) * 1000000n / (10n ** 18n)).toString()) / 1000000);
  return num.toLocaleString('en-US');
}

function isUserRejected(error) {
  return error?.code === 4001 ||
    error?.code === 'ACTION_REJECTED' ||
    error?.info?.error?.code === 4001 ||
    error?.message?.includes('user rejected') ||
    error?.message?.includes('User denied');
}

// ── formatAddress ──
describe('formatAddress', () => {
  test('formats a full address to short form', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    assert.equal(formatAddress(addr), '0x1234...5678');
  });

  test('returns empty string for null', () => {
    assert.equal(formatAddress(null), '');
  });

  test('returns empty string for undefined', () => {
    assert.equal(formatAddress(undefined), '');
  });

  test('returns empty string for empty string', () => {
    assert.equal(formatAddress(''), '');
  });

  test('preserves checksum address casing', () => {
    const addr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    const result = formatAddress(addr);
    assert.equal(result, '0xAbCd...Ef12');
    assert.ok(result.includes('...'));
  });
});

// ── formatTokenAmount ──
describe('formatTokenAmount', () => {
  const ETH = 10n ** 18n;

  test('formats 0 tokens', () => {
    // 0 wei → "0"
    assert.equal(formatTokenAmount(0n), '0');
  });

  test('formats 1000 tokens', () => {
    assert.equal(formatTokenAmount(1000n * ETH), '1,000');
  });

  test('formats 1000000 tokens (1M)', () => {
    assert.equal(formatTokenAmount(1_000_000n * ETH), '1,000,000');
  });

  test('floors fractional tokens', () => {
    // 1.9 tokens → 1
    const amount = ETH + ETH * 9n / 10n; // 1.9 ETH in wei
    assert.equal(formatTokenAmount(amount), '1');
  });

  test('formats 20000 tokens (dashboard default)', () => {
    assert.equal(formatTokenAmount(20_000n * ETH), '20,000');
  });
});

// ── isUserRejected ──
describe('isUserRejected', () => {
  test('returns true for MetaMask code 4001', () => {
    assert.equal(isUserRejected({ code: 4001 }), true);
  });

  test('returns true for ethers ACTION_REJECTED', () => {
    assert.equal(isUserRejected({ code: 'ACTION_REJECTED' }), true);
  });

  test('returns true for nested info.error.code 4001', () => {
    assert.equal(isUserRejected({ info: { error: { code: 4001 } } }), true);
  });

  test('returns true for "user rejected" message', () => {
    assert.equal(isUserRejected({ message: 'MetaMask: user rejected the request' }), true);
  });

  test('returns true for "User denied" message', () => {
    assert.equal(isUserRejected({ message: 'User denied transaction signature' }), true);
  });

  test('returns false for unrelated error', () => {
    assert.equal(isUserRejected({ code: 500, message: 'Internal error' }), false);
  });

  test('returns falsy for null', () => {
    assert.ok(!isUserRejected(null));
  });

  test('returns falsy for undefined', () => {
    assert.ok(!isUserRejected(undefined));
  });

  test('returns falsy for empty object', () => {
    assert.ok(!isUserRejected({}));
  });

  test('returns true for "User denied transaction" (includes "User denied")', () => {
    assert.equal(isUserRejected({ message: 'User denied transaction' }), true);
  });
});
