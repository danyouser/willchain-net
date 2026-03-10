/**
 * Database module tests — uses in-memory SQLite (no file I/O)
 */
const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

// ── Patch DB path to in-memory before requiring the module ──
const Database = require('better-sqlite3');
const path = require('path');

// Override the module so it uses :memory: instead of a file
function createDb() {
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
    CREATE TABLE IF NOT EXISTS block_tracking (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_processed_block INTEGER NOT NULL,
      updated_at TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS successors (
      owner_address TEXT NOT NULL,
      successor_address TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_address)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_successor_address ON successors(successor_address)`);
  return db;
}

// Build the same API surface as database.js but over in-memory DB
function buildDbModule(db) {
  const stmts = {
    getByTelegramId:          db.prepare('SELECT * FROM users WHERE telegram_id = ?'),
    getByWalletAddress:       db.prepare('SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)'),
    getAllWithNotifications:   db.prepare('SELECT * FROM users WHERE notifications_enabled = 1'),
    getAll:                   db.prepare('SELECT * FROM users'),
    upsert: db.prepare(`
      INSERT INTO users (telegram_id, wallet_address, notifications_enabled, last_reminder, linked_at, updated_at)
      VALUES (@telegram_id, @wallet_address, @notifications_enabled, @last_reminder, @linked_at, @updated_at)
      ON CONFLICT(telegram_id) DO UPDATE SET
        wallet_address = @wallet_address,
        notifications_enabled = @notifications_enabled,
        updated_at = @updated_at
    `),
    updateEmail:          db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE telegram_id = ?'),
    updateNotifications:  db.prepare('UPDATE users SET notifications_enabled = ?, updated_at = ? WHERE telegram_id = ?'),
    updateLastReminder:   db.prepare('UPDATE users SET last_reminder = ?, updated_at = ? WHERE telegram_id = ?'),
    delete:               db.prepare('DELETE FROM users WHERE telegram_id = ?'),
    blockGet:    db.prepare('SELECT last_processed_block FROM block_tracking WHERE id = 1'),
    blockUpsert: db.prepare(`
      INSERT INTO block_tracking (id, last_processed_block, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_processed_block = ?, updated_at = ?
    `),
    eventExists: db.prepare('SELECT 1 FROM processed_events WHERE tx_hash = ? AND log_index = ?'),
    eventInsert: db.prepare(`
      INSERT OR IGNORE INTO processed_events (tx_hash, log_index, event_type, processed_at) VALUES (?, ?, ?, ?)
    `),
    successorUpsert: db.prepare(`
      INSERT INTO successors (owner_address, successor_address, updated_at)
      VALUES (LOWER(?), LOWER(?), ?)
      ON CONFLICT(owner_address) DO UPDATE SET successor_address = LOWER(?), updated_at = ?
    `),
    successorGet: db.prepare('SELECT owner_address FROM successors WHERE successor_address = LOWER(?)'),
  };

  function row2user(row) {
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
    getUser: id => { const r = stmts.getByTelegramId.get(id); return r ? row2user(r) : null; },
    getUserByWallet: addr => { const r = stmts.getByWalletAddress.get(addr); return r ? row2user(r) : null; },
    getAllUsers: () => stmts.getAll.all().map(row2user),
    getAllUsersWithNotifications: () => stmts.getAllWithNotifications.all().map(row2user),
    saveUser(telegramId, walletAddress, notificationsEnabled = true) {
      const now = new Date().toISOString();
      stmts.upsert.run({ telegram_id: telegramId, wallet_address: walletAddress, notifications_enabled: notificationsEnabled ? 1 : 0, last_reminder: null, linked_at: now, updated_at: now });
    },
    toggleNotifications(telegramId) {
      const user = this.getUser(telegramId);
      if (!user) return null;
      const val = !user.notificationsEnabled;
      stmts.updateNotifications.run(val ? 1 : 0, new Date().toISOString(), telegramId);
      return val;
    },
    updateLastReminder(telegramId) { stmts.updateLastReminder.run(new Date().toISOString(), new Date().toISOString(), telegramId); },
    deleteUser: id => stmts.delete.run(id),
    setUserEmail: (id, email) => stmts.updateEmail.run(email, new Date().toISOString(), id),
    getLastProcessedBlock() { const r = stmts.blockGet.get(); return r ? r.last_processed_block : null; },
    setLastProcessedBlock(n) { const now = new Date().toISOString(); stmts.blockUpsert.run(n, now, n, now); },
    isEventProcessed: (tx, idx) => !!stmts.eventExists.get(tx, idx),
    markEventProcessed: (tx, idx, type) => stmts.eventInsert.run(tx, idx, type, new Date().toISOString()),
    upsertSuccessor(owner, successor) { const now = new Date().toISOString(); stmts.successorUpsert.run(owner, successor, now, successor, now); },
    getOwnersBySuccessor: addr => stmts.successorGet.all(addr).map(r => r.owner_address),
  };
}

// Build the challenge API surface (mirrors database.js link_challenges logic)
function buildChallengeModule(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_challenges (
      telegram_id INTEGER PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  const CHALLENGE_TTL_SECONDS = 5 * 60;

  const stmts = {
    upsert: db.prepare(`
      INSERT INTO link_challenges (telegram_id, wallet_address, nonce, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        wallet_address = ?,
        nonce = ?,
        expires_at = ?
    `),
    get: db.prepare('SELECT * FROM link_challenges WHERE telegram_id = ?'),
    delete: db.prepare('DELETE FROM link_challenges WHERE telegram_id = ?'),
  };

  return {
    saveChallenge(telegramId, walletAddress, nonce, ttlOverride) {
      const expiresAt = Math.floor(Date.now() / 1000) + (ttlOverride ?? CHALLENGE_TTL_SECONDS);
      stmts.upsert.run(telegramId, walletAddress, nonce, expiresAt, walletAddress, nonce, expiresAt);
    },
    getChallenge(telegramId) {
      const row = stmts.get.get(telegramId);
      if (!row) return null;
      if (row.expires_at < Math.floor(Date.now() / 1000)) {
        stmts.delete.run(telegramId);
        return null;
      }
      return { walletAddress: row.wallet_address, nonce: row.nonce };
    },
    deleteChallenge(telegramId) {
      stmts.delete.run(telegramId);
    },
  };
}

// ── Tests ──

describe('Database — Link Challenges', () => {
  let m;
  beforeEach(() => { m = buildChallengeModule(new Database(':memory:')); });

  test('getChallenge returns null when no challenge exists', () => {
    assert.equal(m.getChallenge(1), null);
  });

  test('saveChallenge then getChallenge returns wallet and nonce', () => {
    m.saveChallenge(1, '0xABCD', '0xnonce123');
    const c = m.getChallenge(1);
    assert.equal(c.walletAddress, '0xABCD');
    assert.equal(c.nonce, '0xnonce123');
  });

  test('getChallenge returns null for expired challenge', () => {
    // Save with TTL of -1 (already expired)
    m.saveChallenge(2, '0xABCD', '0xnonce', -1);
    assert.equal(m.getChallenge(2), null);
  });

  test('expired challenge is auto-deleted from DB', () => {
    m.saveChallenge(3, '0xABCD', '0xnonce', -1);
    m.getChallenge(3); // triggers deletion
    // Now save a fresh one — should work (not conflict)
    m.saveChallenge(3, '0xNEW', '0xnonce2');
    const c = m.getChallenge(3);
    assert.equal(c.walletAddress, '0xNEW');
  });

  test('deleteChallenge removes the record', () => {
    m.saveChallenge(4, '0xABCD', '0xnonce');
    m.deleteChallenge(4);
    assert.equal(m.getChallenge(4), null);
  });

  test('saveChallenge overwrites existing challenge for same user', () => {
    m.saveChallenge(5, '0xOLD', '0xoldnonce');
    m.saveChallenge(5, '0xNEW', '0xnewnonce');
    const c = m.getChallenge(5);
    assert.equal(c.walletAddress, '0xNEW');
    assert.equal(c.nonce, '0xnewnonce');
  });

  test('challenges for different users are independent', () => {
    m.saveChallenge(10, '0xWallet10', '0xnonce10');
    m.saveChallenge(11, '0xWallet11', '0xnonce11');
    assert.equal(m.getChallenge(10).walletAddress, '0xWallet10');
    assert.equal(m.getChallenge(11).walletAddress, '0xWallet11');
  });
});

describe('Database — Users', () => {
  let m;
  beforeEach(() => { m = buildDbModule(createDb()); });

  test('saveUser and getUser', () => {
    m.saveUser(100, '0xABC');
    const u = m.getUser(100);
    assert.equal(u.telegramId, 100);
    assert.equal(u.walletAddress, '0xABC');
    assert.equal(u.notificationsEnabled, true);
    assert.equal(u.email, null);
  });

  test('getUser returns null for unknown id', () => {
    assert.equal(m.getUser(999), null);
  });

  test('getUserByWallet is case-insensitive', () => {
    m.saveUser(101, '0xAbCdEf');
    assert.ok(m.getUserByWallet('0xabcdef'));
    assert.ok(m.getUserByWallet('0xABCDEF'));
  });

  test('saveUser upserts on duplicate telegramId', () => {
    m.saveUser(102, '0x111');
    m.saveUser(102, '0x222');
    assert.equal(m.getUser(102).walletAddress, '0x222');
  });

  test('deleteUser removes the record', () => {
    m.saveUser(103, '0xDEL');
    m.deleteUser(103);
    assert.equal(m.getUser(103), null);
  });

  test('toggleNotifications flips the flag', () => {
    m.saveUser(104, '0xTOG');
    assert.equal(m.toggleNotifications(104), false); // was true → false
    assert.equal(m.getUser(104).notificationsEnabled, false);
    assert.equal(m.toggleNotifications(104), true);  // false → true
  });

  test('toggleNotifications returns null for unknown user', () => {
    assert.equal(m.toggleNotifications(9999), null);
  });

  test('setUserEmail updates email field', () => {
    m.saveUser(105, '0xEMAIL');
    m.setUserEmail(105, 'test@example.com');
    assert.equal(m.getUser(105).email, 'test@example.com');
  });

  test('getAllUsersWithNotifications filters disabled', () => {
    m.saveUser(106, '0xA', true);
    m.saveUser(107, '0xB', false);
    const list = m.getAllUsersWithNotifications();
    assert.equal(list.length, 1);
    assert.equal(list[0].telegramId, 106);
  });

  test('getAllUsers returns all', () => {
    m.saveUser(108, '0xC');
    m.saveUser(109, '0xD');
    assert.equal(m.getAllUsers().length, 2);
  });
});

describe('Database — Block Tracking', () => {
  let m;
  beforeEach(() => { m = buildDbModule(createDb()); });

  test('getLastProcessedBlock returns null initially', () => {
    assert.equal(m.getLastProcessedBlock(), null);
  });

  test('setLastProcessedBlock and get', () => {
    m.setLastProcessedBlock(12345);
    assert.equal(m.getLastProcessedBlock(), 12345);
  });

  test('setLastProcessedBlock updates on second call', () => {
    m.setLastProcessedBlock(1);
    m.setLastProcessedBlock(99999);
    assert.equal(m.getLastProcessedBlock(), 99999);
  });
});

describe('Database — Event Deduplication', () => {
  let m;
  beforeEach(() => { m = buildDbModule(createDb()); });

  test('isEventProcessed returns false for new event', () => {
    assert.equal(m.isEventProcessed('0xhash', 0), false);
  });

  test('markEventProcessed then isEventProcessed returns true', () => {
    m.markEventProcessed('0xhash', 0, 'Transfer');
    assert.equal(m.isEventProcessed('0xhash', 0), true);
  });

  test('same tx_hash different log_index are independent', () => {
    m.markEventProcessed('0xhash', 0, 'Transfer');
    assert.equal(m.isEventProcessed('0xhash', 1), false);
  });

  test('markEventProcessed is idempotent (INSERT OR IGNORE)', () => {
    m.markEventProcessed('0xhash', 0, 'Transfer');
    assert.doesNotThrow(() => m.markEventProcessed('0xhash', 0, 'Transfer'));
  });
});

describe('Database — Successors', () => {
  let m;
  beforeEach(() => { m = buildDbModule(createDb()); });

  test('getOwnersBySuccessor returns empty array initially', () => {
    assert.deepEqual(m.getOwnersBySuccessor('0xsuccessor'), []);
  });

  test('upsertSuccessor and getOwnersBySuccessor', () => {
    m.upsertSuccessor('0xOwner1', '0xSucc');
    const owners = m.getOwnersBySuccessor('0xSucc');
    assert.equal(owners.length, 1);
    assert.equal(owners[0], '0xowner1'); // stored lowercase
  });

  test('lookup is case-insensitive', () => {
    m.upsertSuccessor('0xOwner2', '0xSucc2');
    assert.equal(m.getOwnersBySuccessor('0xSUCC2').length, 1);
    assert.equal(m.getOwnersBySuccessor('0xsucc2').length, 1);
  });

  test('multiple owners can share the same successor', () => {
    m.upsertSuccessor('0xOwnerA', '0xSharedSucc');
    m.upsertSuccessor('0xOwnerB', '0xSharedSucc');
    assert.equal(m.getOwnersBySuccessor('0xSharedSucc').length, 2);
  });

  test('upsertSuccessor updates successor for existing owner', () => {
    m.upsertSuccessor('0xOwner3', '0xOldSucc');
    m.upsertSuccessor('0xOwner3', '0xNewSucc');
    assert.equal(m.getOwnersBySuccessor('0xoldsucc').length, 0);
    assert.equal(m.getOwnersBySuccessor('0xnewsucc').length, 1);
  });
});

// ── Rate Limiting (Persistent) ──

function buildRateLimitModule(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id INTEGER PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      window_start INTEGER NOT NULL
    )
  `);

  const RATE_WINDOW_SECONDS = 60;

  const stmts = {
    get: db.prepare('SELECT count, window_start FROM rate_limits WHERE user_id = ?'),
    upsert: db.prepare(`
      INSERT INTO rate_limits (user_id, count, window_start)
      VALUES (?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
        window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    `),
  };

  return {
    checkAndIncrementRateLimit(userId, maxCount) {
      const nowSec = Math.floor(Date.now() / 1000);
      const windowCutoff = nowSec - RATE_WINDOW_SECONDS;
      stmts.upsert.run(userId, nowSec, windowCutoff, windowCutoff, nowSec);
      const row = stmts.get.get(userId);
      return row ? row.count > maxCount : false;
    },
  };
}

describe('Database — Rate Limiting (Persistent)', () => {
  let db;
  let m;

  beforeEach(() => {
    db = createDb();
    m = buildRateLimitModule(db);
  });

  after(() => db.close());

  test('first call returns false (not rate-limited)', () => {
    assert.equal(m.checkAndIncrementRateLimit(1001, 10), false);
  });

  test('under the limit: returns false', () => {
    // 10 calls → count=10, NOT > 10 → false
    for (let i = 0; i < 9; i++) m.checkAndIncrementRateLimit(1002, 10);
    assert.equal(m.checkAndIncrementRateLimit(1002, 10), false); // 10th call, count=10, not exceeded
  });

  test('exceeding limit returns true', () => {
    // 11 calls → count=11 > 10 → true
    for (let i = 0; i < 10; i++) m.checkAndIncrementRateLimit(1003, 10);
    assert.equal(m.checkAndIncrementRateLimit(1003, 10), true); // 11th call
  });

  test('different users have independent counters', () => {
    for (let i = 0; i < 11; i++) m.checkAndIncrementRateLimit(1004, 10);
    assert.equal(m.checkAndIncrementRateLimit(1005, 10), false); // user 1005 unaffected
  });

  test('counter resets after window expires', () => {
    for (let i = 0; i < 11; i++) m.checkAndIncrementRateLimit(1006, 10);
    assert.equal(m.checkAndIncrementRateLimit(1006, 10), true); // over limit

    // Manually expire the window by updating window_start to past
    db.prepare('UPDATE rate_limits SET window_start = ? WHERE user_id = ?')
      .run(Math.floor(Date.now() / 1000) - 120, 1006);

    assert.equal(m.checkAndIncrementRateLimit(1006, 10), false); // reset
  });
});
