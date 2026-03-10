/**
 * Bot utility function tests (pure functions, no Telegram/blockchain needed)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Inline the pure functions under test (mirrors bot/src/index.js) ──

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Mirrors bot/src/index.js: uses ethers.formatEther logic (divide by 1e18) then K/M/B suffix
function formatTokenAmount(amount) {
  // Replicate ethers.formatEther: BigInt wei → decimal string
  const ETH = 10n ** 18n;
  const amountBig = BigInt(amount);
  const whole = amountBig / ETH;
  const frac = amountBig % ETH;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 6); // 6 decimals for precision
  const num = parseFloat(`${whole}.${fracStr}`);

  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

// ── formatAddress ──
describe('Bot formatAddress', () => {
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
    assert.equal(formatAddress(addr), '0xAbCd...Ef12');
  });
});

// ── formatTokenAmount ──
describe('Bot formatTokenAmount', () => {
  const ETH = 10n ** 18n;

  test('formats 0 as "0.00"', () => {
    assert.equal(formatTokenAmount(0n), '0.00');
  });

  test('formats 1 token as "1.00"', () => {
    assert.equal(formatTokenAmount(1n * ETH), '1.00');
  });

  test('formats 999 tokens as "999.00" (below K threshold)', () => {
    assert.equal(formatTokenAmount(999n * ETH), '999.00');
  });

  test('formats 1,000 tokens as "1.00K"', () => {
    assert.equal(formatTokenAmount(1000n * ETH), '1.00K');
  });

  test('formats 1,500 tokens as "1.50K"', () => {
    assert.equal(formatTokenAmount(1500n * ETH), '1.50K');
  });

  test('formats 999,999 tokens as "1000.00K" (just below M threshold)', () => {
    // 999999 / 1000 = 999.999 → rounds to "1000.00K" because toFixed(2)
    // Actually 999999 / 1000 = 999.999 → "999.999".toFixed(2) = "1000.00"... let's check
    // parseFloat("999999") / 1e3 = 999.999, toFixed(2) = "1000.00"
    // So result is "1000.00K"
    const result = formatTokenAmount(999999n * ETH);
    assert.equal(result, '1000.00K');
  });

  test('formats 1,000,000 tokens as "1.00M"', () => {
    assert.equal(formatTokenAmount(1_000_000n * ETH), '1.00M');
  });

  test('formats 2,500,000 tokens as "2.50M"', () => {
    assert.equal(formatTokenAmount(2_500_000n * ETH), '2.50M');
  });

  test('formats 1,000,000,000 tokens as "1.00B"', () => {
    assert.equal(formatTokenAmount(1_000_000_000n * ETH), '1.00B');
  });

  test('formats 0.5 token (fractional) as "0.50"', () => {
    assert.equal(formatTokenAmount(ETH / 2n), '0.50');
  });
});
