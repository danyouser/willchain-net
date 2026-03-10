/**
 * WillChain Bot — Utilities
 * Shared helper functions and structured logging.
 */

const { ethers } = require('ethers');

// ============ Structured Logging ============
// Outputs JSON lines when LOG_FORMAT=json (for log aggregators),
// or human-readable with emoji for development.

const LOG_JSON = process.env.LOG_FORMAT === 'json';

function log(level, message, data = null) {
  const ts = new Date().toISOString();
  if (LOG_JSON) {
    const entry = { ts, level, msg: message };
    if (data) entry.data = data;
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const prefix = { INFO: '📋', WARN: '⚠️', ERROR: '❌', SUCCESS: '✅', EVENT: '📡' }[level] || '•';
    const line = `[${ts}] ${prefix} [${level}] ${message}`;
    if (data) console.log(line, typeof data === 'object' ? JSON.stringify(data) : data);
    else console.log(line);
  }
}

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(amount) {
  const formatted = ethers.formatEther(amount);
  const num = parseFloat(formatted);
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

module.exports = { log, formatAddress, formatTokenAmount };
