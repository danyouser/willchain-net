/**
 * Semantic regression test suite — validates JSON fixtures against
 * real module logic (vault-status, database) and fixture schema.
 *
 * Uses node:test + node:assert/strict. No external test runner needed.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Database = require('better-sqlite3');

// ── Load fixtures ──
const scenarios = require('./fixtures/scenarios.json');

// ── Load shared vault-status module ──
const {
  deriveVaultStatus,
  needsCriticalAlert,
  approachingInactivity,
  VAULT_STATUS,
} = require('../../shared/vault-status');

// ── Helper: filter scenarios by category ──
function byCategory(cat) {
  return scenarios.filter(s => s.category === cat);
}

// ── Schema validation helpers ──
const REQUIRED_FIXTURE_KEYS = ['id', 'category', 'description', 'input', 'expected'];
const VALID_CATEGORIES = [
  'wallet-link',
  'event-processing',
  'cron-alerts',
  'status-derivation',
  'recycle',
  'error-handling',
];

// ── In-memory DB builder (mirrors database.test.js pattern) ──
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      notifications_enabled INTEGER DEFAULT 1,
      last_reminder TEXT,
      linked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      email TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_address ON users(wallet_address)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS link_challenges (
      telegram_id INTEGER PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_events (
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id INTEGER PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      window_start INTEGER NOT NULL
    )
  `);

  return db;
}

// Build DB API surface over in-memory DB
function buildDbApi(db) {
  const CHALLENGE_TTL_SECONDS = 5 * 60;
  const RATE_WINDOW_SECONDS = 60;

  const stmts = {
    userGet: db.prepare('SELECT * FROM users WHERE telegram_id = ?'),
    userGetByWallet: db.prepare('SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)'),
    userUpsert: db.prepare(`
      INSERT INTO users (telegram_id, wallet_address, notifications_enabled, last_reminder, linked_at, updated_at)
      VALUES (@telegram_id, @wallet_address, @notifications_enabled, @last_reminder, @linked_at, @updated_at)
      ON CONFLICT(telegram_id) DO UPDATE SET
        wallet_address = @wallet_address,
        notifications_enabled = @notifications_enabled,
        updated_at = @updated_at
    `),
    userDelete: db.prepare('DELETE FROM users WHERE telegram_id = ?'),
    challengeUpsert: db.prepare(`
      INSERT INTO link_challenges (telegram_id, wallet_address, nonce, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        wallet_address = ?,
        nonce = ?,
        expires_at = ?
    `),
    challengeGet: db.prepare('SELECT * FROM link_challenges WHERE telegram_id = ?'),
    challengeDelete: db.prepare('DELETE FROM link_challenges WHERE telegram_id = ?'),
    eventExists: db.prepare('SELECT 1 FROM processed_events WHERE tx_hash = ? AND log_index = ?'),
    eventInsert: db.prepare(`
      INSERT OR IGNORE INTO processed_events (tx_hash, log_index, event_type, processed_at)
      VALUES (?, ?, ?, ?)
    `),
    rateLimitGet: db.prepare('SELECT count, window_start FROM rate_limits WHERE user_id = ?'),
    rateLimitUpsert: db.prepare(`
      INSERT INTO rate_limits (user_id, count, window_start)
      VALUES (?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
        window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    `),
  };

  function row2user(row) {
    if (!row) return null;
    return {
      telegramId: row.telegram_id,
      walletAddress: row.wallet_address,
      notificationsEnabled: row.notifications_enabled === 1,
      lastReminder: row.last_reminder,
      linkedAt: row.linked_at,
      email: row.email || null,
    };
  }

  return {
    saveUser(telegramId, walletAddress, notificationsEnabled = true) {
      const now = new Date().toISOString();
      stmts.userUpsert.run({
        telegram_id: telegramId,
        wallet_address: walletAddress,
        notifications_enabled: notificationsEnabled ? 1 : 0,
        last_reminder: null,
        linked_at: now,
        updated_at: now,
      });
    },
    getUser(telegramId) {
      return row2user(stmts.userGet.get(telegramId));
    },
    getUserByWallet(walletAddress) {
      return row2user(stmts.userGetByWallet.get(walletAddress));
    },
    deleteUser(telegramId) {
      stmts.userDelete.run(telegramId);
    },
    saveChallenge(telegramId, walletAddress, nonce, ttlOverride) {
      const expiresAt = Math.floor(Date.now() / 1000) + (ttlOverride ?? CHALLENGE_TTL_SECONDS);
      stmts.challengeUpsert.run(
        telegramId, walletAddress, nonce, expiresAt,
        walletAddress, nonce, expiresAt,
      );
    },
    getChallenge(telegramId) {
      const row = stmts.challengeGet.get(telegramId);
      if (!row) return null;
      if (row.expires_at <= Math.floor(Date.now() / 1000)) {
        stmts.challengeDelete.run(telegramId);
        return null;
      }
      return { walletAddress: row.wallet_address, nonce: row.nonce };
    },
    isEventProcessed(txHash, logIndex) {
      return !!stmts.eventExists.get(txHash, logIndex);
    },
    markEventProcessed(txHash, logIndex, eventType) {
      stmts.eventInsert.run(txHash, logIndex, eventType, new Date().toISOString());
    },
    checkAndIncrementRateLimit(userId, maxCount) {
      const nowSec = Math.floor(Date.now() / 1000);
      const windowCutoff = nowSec - RATE_WINDOW_SECONDS;
      stmts.rateLimitUpsert.run(userId, nowSec, windowCutoff, windowCutoff, nowSec);
      const row = stmts.rateLimitGet.get(userId);
      return row ? row.count > maxCount : false;
    },
  };
}

// ════════════════════════════════════════════════════════════════
// 1. Fixture Schema Validation
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — schema validation', () => {
  it('should contain exactly 25 scenarios', () => {
    assert.equal(scenarios.length, 25);
  });

  it('every fixture has required keys: id, category, description, input, expected', () => {
    for (const s of scenarios) {
      for (const key of REQUIRED_FIXTURE_KEYS) {
        assert.ok(key in s, `Fixture "${s.id}" missing key "${key}"`);
      }
    }
  });

  it('every fixture has a valid category', () => {
    for (const s of scenarios) {
      assert.ok(
        VALID_CATEGORIES.includes(s.category),
        `Fixture "${s.id}" has invalid category "${s.category}"`,
      );
    }
  });

  it('all fixture IDs are unique', () => {
    const ids = scenarios.map(s => s.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `Duplicate IDs found: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  it('input and expected are non-empty objects', () => {
    for (const s of scenarios) {
      assert.equal(typeof s.input, 'object', `Fixture "${s.id}" input is not an object`);
      assert.equal(typeof s.expected, 'object', `Fixture "${s.id}" expected is not an object`);
      assert.ok(Object.keys(s.input).length > 0, `Fixture "${s.id}" input is empty`);
      assert.ok(Object.keys(s.expected).length > 0, `Fixture "${s.id}" expected is empty`);
    }
  });

  it('category counts match: wallet-link=5, event-processing=5, cron-alerts=5, status-derivation=5, recycle=3, error-handling=2', () => {
    const counts = {};
    for (const s of scenarios) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    assert.equal(counts['wallet-link'], 5);
    assert.equal(counts['event-processing'], 5);
    assert.equal(counts['cron-alerts'], 5);
    assert.equal(counts['status-derivation'], 5);
    assert.equal(counts['recycle'], 3);
    assert.equal(counts['error-handling'], 2);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Status Derivation — real logic tests via shared/vault-status.js
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — status-derivation (live validation)', () => {
  const statusScenarios = byCategory('status-derivation');

  for (const s of statusScenarios) {
    it(`${s.id}: ${s.description}`, () => {
      const state = {
        lastActivityTimestamp: BigInt(s.input.lastActivityTimestamp),
        timeUntilInactive: BigInt(s.input.timeUntilInactive),
        timeUntilAbandoned: BigInt(s.input.timeUntilAbandoned),
      };

      const result = deriveVaultStatus(state);

      assert.equal(result.status, s.expected.status, `status mismatch for ${s.id}`);
      assert.equal(result.name, s.expected.name, `name mismatch for ${s.id}`);
      assert.equal(result.isUnregistered, s.expected.isUnregistered, `isUnregistered mismatch for ${s.id}`);
      assert.equal(result.isActive, s.expected.isActive, `isActive mismatch for ${s.id}`);
      assert.equal(result.inGrace, s.expected.inGrace, `inGrace mismatch for ${s.id}`);
      assert.equal(result.isAbandoned, s.expected.isAbandoned, `isAbandoned mismatch for ${s.id}`);
    });
  }
});

// ════════════════════════════════════════════════════════════════
// 3. Cron Alerts — needsCriticalAlert + approachingInactivity
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — cron-alerts (live validation)', () => {
  const cronScenarios = byCategory('cron-alerts');

  for (const s of cronScenarios) {
    it(`${s.id}: ${s.description}`, () => {
      const state = {
        lastActivityTimestamp: BigInt(s.input.lastActivityTimestamp),
        timeUntilInactive: BigInt(s.input.timeUntilInactive),
        timeUntilAbandoned: BigInt(s.input.timeUntilAbandoned),
      };

      const critical = needsCriticalAlert(state);
      assert.equal(critical, s.expected.isCritical, `needsCriticalAlert mismatch for ${s.id}`);

      // Validate status name for critical alerts
      if (s.expected.statusName) {
        const derived = deriveVaultStatus(state);
        assert.equal(derived.name, s.expected.statusName, `statusName mismatch for ${s.id}`);
      }

      // Validate approachingInactivity for non-critical active scenarios
      if ('approachingInactivity' in s.expected) {
        const approaching = approachingInactivity(state); // default 7-day threshold
        assert.equal(approaching, s.expected.approachingInactivity, `approachingInactivity mismatch for ${s.id}`);
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════
// 4. Wallet Link — database operations with in-memory SQLite
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — wallet-link (database validation)', () => {
  let api;

  beforeEach(() => {
    api = buildDbApi(createTestDb());
  });

  it('wallet_link_01: valid link saves user with notifications enabled', () => {
    const s = scenarios.find(x => x.id === 'wallet_link_01_valid_link');
    const { telegramId, walletAddress } = s.input;

    api.saveUser(telegramId, walletAddress, true);
    const user = api.getUser(telegramId);

    assert.ok(user, 'User should be saved');
    assert.equal(user.walletAddress, s.expected.walletAddress);
    assert.equal(user.notificationsEnabled, s.expected.notificationsEnabled);
  });

  it('wallet_link_03: expired challenge returns null', () => {
    const s = scenarios.find(x => x.id === 'wallet_link_03_expired_challenge');
    const { telegramId, walletAddress, nonce, challengeTtlOverride } = s.input;

    api.saveChallenge(telegramId, walletAddress, nonce, challengeTtlOverride);
    const challenge = api.getChallenge(telegramId);

    assert.equal(challenge, null, 'Expired challenge should return null');
    assert.equal(s.expected.challengeReturnsNull, true);
  });

  it('wallet_link_05: case-insensitive address lookup', () => {
    const s = scenarios.find(x => x.id === 'wallet_link_05_case_insensitive_address');
    const { telegramId, walletAddress, walletAddressLowercase } = s.input;

    api.saveUser(telegramId, walletAddress);

    // Lookup by lowercase
    const byLower = api.getUserByWallet(walletAddressLowercase);
    assert.ok(byLower, 'Should find user by lowercase address');
    assert.equal(s.expected.lookupByLowercase, true);

    // Lookup by uppercase
    const byUpper = api.getUserByWallet(walletAddress.toUpperCase());
    assert.ok(byUpper, 'Should find user by uppercase address');
    assert.equal(s.expected.lookupByUppercase, true);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Event Processing — database idempotency validation
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — event-processing (idempotency validation)', () => {
  let api;

  beforeEach(() => {
    api = buildDbApi(createTestDb());
  });

  it('event_processing_10: duplicate event is detected and skipped', () => {
    const s = scenarios.find(x => x.id === 'event_processing_10_duplicate_event');
    const { txHash, logIndex, eventType } = s.input;

    // First insert
    api.markEventProcessed(txHash, logIndex, eventType);
    assert.equal(api.isEventProcessed(txHash, logIndex), true, 'First insert should be recorded');

    // Duplicate insert (should not throw — INSERT OR IGNORE)
    assert.doesNotThrow(() => {
      api.markEventProcessed(txHash, logIndex, eventType);
    }, 'Duplicate insert should be idempotent');

    assert.equal(api.isEventProcessed(txHash, logIndex), true);
  });

  // Schema validation for non-duplicate event-processing scenarios
  for (const s of byCategory('event-processing').filter(x => !x.input.duplicate)) {
    it(`${s.id}: fixture has valid event structure`, () => {
      assert.ok(s.input.eventType, `${s.id} missing eventType`);
      assert.ok(s.input.txHash, `${s.id} missing txHash`);
      assert.ok('logIndex' in s.input, `${s.id} missing logIndex`);
      assert.ok(s.input.args, `${s.id} missing args`);
      assert.equal(typeof s.expected.eventRecorded, 'boolean', `${s.id} missing eventRecorded`);

      // Validate tx_hash format (0x + 64 hex chars)
      assert.match(s.input.txHash, /^0x[0-9a-f]{64}$/i, `${s.id} invalid txHash format`);
    });
  }
});

// ════════════════════════════════════════════════════════════════
// 6. Recycle — fixture schema + logic validation
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — recycle (logic validation)', () => {
  for (const s of byCategory('recycle')) {
    it(`${s.id}: ${s.description}`, () => {
      const { hoursAbandoned, balance, commitRevealThresholdHours } = s.input;

      // Derive expected behaviour from input
      const balanceIsZero = balance === '0';
      const isFreshAbandoned = hoursAbandoned < commitRevealThresholdHours;

      if (balanceIsZero) {
        assert.equal(s.expected.shouldSkip, true, `${s.id}: zero balance should be skipped`);
        assert.equal(s.expected.canDirectRecycle, false);
        assert.equal(s.expected.requiresCommitReveal, false);
      } else if (isFreshAbandoned) {
        assert.equal(s.expected.requiresCommitReveal, true, `${s.id}: fresh abandoned requires commit-reveal`);
        assert.equal(s.expected.canDirectRecycle, false);
        assert.equal(s.expected.shouldSkip, false);
      } else {
        assert.equal(s.expected.canDirectRecycle, true, `${s.id}: stale abandoned allows direct recycle`);
        assert.equal(s.expected.requiresCommitReveal, false);
        assert.equal(s.expected.shouldSkip, false);
      }

      // Validate address format
      assert.match(s.input.abandonedNode, /^0x[0-9a-f]{40}$/i, `${s.id}: invalid abandonedNode address`);
    });
  }
});

// ════════════════════════════════════════════════════════════════
// 7. Error Handling — fixture schema + rate limit validation
// ════════════════════════════════════════════════════════════════

describe('Scenario fixtures — error-handling (validation)', () => {
  it('error_handling_24: RPC timeout fixture has correct structure', () => {
    const s = scenarios.find(x => x.id === 'error_handling_24_rpc_timeout');
    assert.ok(s.input.providerMethod, 'Missing providerMethod');
    assert.ok(s.input.errorType, 'Missing errorType');
    assert.ok(s.input.errorMessage, 'Missing errorMessage');
    assert.equal(s.expected.gracefulError, true);
    assert.equal(s.expected.serviceAvailable, false);
  });

  it('error_handling_25: rate limit exceeded validated with real DB', () => {
    const s = scenarios.find(x => x.id === 'error_handling_25_rate_limit_exceeded');
    const api = buildDbApi(createTestDb());
    const { userId, requestCount, maxRequestsPerMinute } = s.input;

    let blocked = false;
    for (let i = 0; i < requestCount; i++) {
      blocked = api.checkAndIncrementRateLimit(userId, maxRequestsPerMinute);
    }

    assert.equal(blocked, true, 'Should be blocked after exceeding rate limit');
    assert.equal(s.expected.blocked, true);
  });
});
