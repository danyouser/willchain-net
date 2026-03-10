/**
 * WillChain Bot - SQLite Database Module
 *
 * Provides persistent storage for:
 * - User wallet mappings
 * - Last processed block for event catch-up
 * - Notification preferences
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'phoenix_bot.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize database schema immediately
console.log('[DB] Initializing database...');

// Users table - stores wallet mappings
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    notifications_enabled INTEGER DEFAULT 1,
    last_reminder TEXT,
    linked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Add email column if it doesn't exist (migration for existing DBs)
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
} catch (e) {
  // Column already exists — ignore
}

// Create index for wallet lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_wallet_address
  ON users(wallet_address)
`);

// Block tracking table - for event catch-up
db.exec(`
  CREATE TABLE IF NOT EXISTS block_tracking (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_processed_block INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Event history table - avoid duplicate notifications
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_events (
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
  )
`);

// Pending link challenges - temporary nonces for wallet ownership verification
db.exec(`
  CREATE TABLE IF NOT EXISTS link_challenges (
    telegram_id INTEGER PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

// Clean up expired challenges on startup
db.exec(`DELETE FROM link_challenges WHERE expires_at < strftime('%s', 'now')`);

// Successors table - index of owner → successor relationships
db.exec(`
  CREATE TABLE IF NOT EXISTS successors (
    owner_address TEXT NOT NULL,
    successor_address TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (owner_address)
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_successor_address
  ON successors(successor_address)
`);

// Rate limit table - persistent across bot restarts
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    user_id INTEGER PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL
  )
`);

// Recycle commits table - for commit-reveal MEV protection
db.exec(`
  CREATE TABLE IF NOT EXISTS recycle_commits (
    abandoned_node TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    commit_block INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Clean up stale rate limit windows on startup
db.exec(`DELETE FROM rate_limits WHERE window_start < ${Math.floor(Date.now() / 1000) - 120}`);

// Clean up old processed events (keep last 7 days)
db.exec(`
  DELETE FROM processed_events
  WHERE processed_at < datetime('now', '-7 days')
`);

console.log('[DB] Database initialized successfully');

// Periodic runtime cleanup of expired link challenges (supplements the startup cleanup above)
setInterval(() => {
  db.exec(`DELETE FROM link_challenges WHERE expires_at < ${Math.floor(Date.now() / 1000)}`);
}, 60_000);

// Periodic runtime cleanup of old processed events (supplements the startup cleanup above)
setInterval(() => {
  db.exec(`DELETE FROM processed_events WHERE processed_at < datetime('now', '-7 days')`);
}, 6 * 60 * 60_000); // every 6 hours

// Periodic runtime cleanup of expired rate limit windows (prevents unbounded table growth)
setInterval(() => {
  db.exec(`DELETE FROM rate_limits WHERE window_start < ${Math.floor(Date.now() / 1000) - 120}`);
}, 5 * 60_000); // every 5 minutes

// ============ User Operations ============

// Prepared statements (created after tables exist)
const userStatements = {
  getByTelegramId: db.prepare('SELECT * FROM users WHERE telegram_id = ?'),
  getByWalletAddress: db.prepare('SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)'),
  getAllWithNotifications: db.prepare('SELECT * FROM users WHERE notifications_enabled = 1'),
  getAll: db.prepare('SELECT * FROM users'),

  upsert: db.prepare(`
    INSERT INTO users (telegram_id, wallet_address, notifications_enabled, last_reminder, linked_at, updated_at)
    VALUES (@telegram_id, @wallet_address, @notifications_enabled, @last_reminder, @linked_at, @updated_at)
    ON CONFLICT(telegram_id) DO UPDATE SET
      wallet_address = @wallet_address,
      notifications_enabled = @notifications_enabled,
      updated_at = @updated_at
  `),

  updateEmail: db.prepare(`
    UPDATE users SET email = ?, updated_at = ? WHERE telegram_id = ?
  `),

  updateNotifications: db.prepare(`
    UPDATE users SET notifications_enabled = ?, updated_at = ? WHERE telegram_id = ?
  `),

  updateLastReminder: db.prepare(`
    UPDATE users SET last_reminder = ?, updated_at = ? WHERE telegram_id = ?
  `),

  delete: db.prepare('DELETE FROM users WHERE telegram_id = ?'),
};

function getUser(telegramId) {
  const row = userStatements.getByTelegramId.get(telegramId);
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

function getUserByWallet(walletAddress) {
  const row = userStatements.getByWalletAddress.get(walletAddress);
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

function getAllUsersWithNotifications() {
  const rows = userStatements.getAllWithNotifications.all();
  return rows.map(row => ({
    telegramId: row.telegram_id,
    walletAddress: row.wallet_address,
    notificationsEnabled: true,
    lastReminder: row.last_reminder,
    linkedAt: row.linked_at,
    email: row.email || null,
  }));
}

function getAllUsers() {
  const rows = userStatements.getAll.all();
  return rows.map(row => ({
    telegramId: row.telegram_id,
    walletAddress: row.wallet_address,
    notificationsEnabled: row.notifications_enabled === 1,
    lastReminder: row.last_reminder,
    linkedAt: row.linked_at,
    email: row.email || null,
  }));
}

function setUserEmail(telegramId, email) {
  userStatements.updateEmail.run(email, new Date().toISOString(), telegramId);
}

function saveUser(telegramId, walletAddress, notificationsEnabled = true) {
  const now = new Date().toISOString();
  userStatements.upsert.run({
    telegram_id: telegramId,
    wallet_address: walletAddress,
    notifications_enabled: notificationsEnabled ? 1 : 0,
    last_reminder: null,
    linked_at: now,
    updated_at: now,
  });
}

function toggleNotifications(telegramId) {
  const user = getUser(telegramId);
  if (!user) return null;

  const newValue = !user.notificationsEnabled;
  userStatements.updateNotifications.run(
    newValue ? 1 : 0,
    new Date().toISOString(),
    telegramId
  );
  return newValue;
}

function updateLastReminder(telegramId) {
  userStatements.updateLastReminder.run(
    new Date().toISOString(),
    new Date().toISOString(),
    telegramId
  );
}

function deleteUser(telegramId) {
  userStatements.delete.run(telegramId);
}

// ============ Block Tracking Operations ============

const blockStatements = {
  get: db.prepare('SELECT last_processed_block FROM block_tracking WHERE id = 1'),
  upsert: db.prepare(`
    INSERT INTO block_tracking (id, last_processed_block, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_processed_block = ?,
      updated_at = ?
  `),
};

function getLastProcessedBlock() {
  const row = blockStatements.get.get();
  return row ? row.last_processed_block : null;
}

function setLastProcessedBlock(blockNumber) {
  const now = new Date().toISOString();
  blockStatements.upsert.run(blockNumber, now, blockNumber, now);
}

// ============ Event Deduplication ============

const eventStatements = {
  exists: db.prepare('SELECT 1 FROM processed_events WHERE tx_hash = ? AND log_index = ?'),
  insert: db.prepare(`
    INSERT OR IGNORE INTO processed_events (tx_hash, log_index, event_type, processed_at)
    VALUES (?, ?, ?, ?)
  `),
};

function isEventProcessed(txHash, logIndex) {
  return !!eventStatements.exists.get(txHash, logIndex);
}

function markEventProcessed(txHash, logIndex, eventType) {
  eventStatements.insert.run(txHash, logIndex, eventType, new Date().toISOString());
}

// ============ Link Challenge Operations ============

const challengeStatements = {
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

const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes

function saveChallenge(telegramId, walletAddress, nonce) {
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
  challengeStatements.upsert.run(
    telegramId, walletAddress, nonce, expiresAt,
    walletAddress, nonce, expiresAt
  );
}

function getChallenge(telegramId) {
  const row = challengeStatements.get.get(telegramId);
  if (!row) return null;
  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    challengeStatements.delete.run(telegramId);
    return null;
  }
  return { walletAddress: row.wallet_address, nonce: row.nonce };
}

function deleteChallenge(telegramId) {
  challengeStatements.delete.run(telegramId);
}

// ============ Successors Operations ============

const successorStatements = {
  upsert: db.prepare(`
    INSERT INTO successors (owner_address, successor_address, updated_at)
    VALUES (LOWER(?), LOWER(?), ?)
    ON CONFLICT(owner_address) DO UPDATE SET
      successor_address = LOWER(?),
      updated_at = ?
  `),
  getBySuccessor: db.prepare(`
    SELECT owner_address FROM successors WHERE successor_address = LOWER(?)
  `),
};

function upsertSuccessor(ownerAddress, successorAddress) {
  const now = new Date().toISOString();
  successorStatements.upsert.run(ownerAddress, successorAddress, now, successorAddress, now);
}

function getOwnersBySuccessor(successorAddress) {
  return successorStatements.getBySuccessor.all(successorAddress).map(r => r.owner_address);
}

// ============ Rate Limiting (Persistent) ============

const RATE_WINDOW_SECONDS = 60;

const rateLimitStatements = {
  get: db.prepare('SELECT count, window_start FROM rate_limits WHERE user_id = ?'),
  upsert: db.prepare(`
    INSERT INTO rate_limits (user_id, count, window_start)
    VALUES (?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      count = CASE
        WHEN window_start < ? THEN 1
        ELSE count + 1
      END,
      window_start = CASE
        WHEN window_start < ? THEN ?
        ELSE window_start
      END
  `),
  cleanup: db.prepare('DELETE FROM rate_limits WHERE window_start < ?'),
};

/**
 * Increment rate limit counter for a user. Returns true if limit exceeded.
 * Window resets after RATE_WINDOW_SECONDS. Persists across bot restarts.
 */
function checkAndIncrementRateLimit(userId, maxCount) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowCutoff = nowSec - RATE_WINDOW_SECONDS;
  rateLimitStatements.upsert.run(userId, nowSec, windowCutoff, windowCutoff, nowSec);
  const row = rateLimitStatements.get.get(userId);
  return row ? row.count > maxCount : false;
}

// ============ Recycle Commits ============

const recycleStatements = {
  upsert: db.prepare(`
    INSERT INTO recycle_commits (abandoned_node, salt, commit_block, created_at)
    VALUES (LOWER(?), ?, ?, ?)
    ON CONFLICT(abandoned_node) DO UPDATE SET
      salt = ?,
      commit_block = ?,
      created_at = ?
  `),
  get: db.prepare('SELECT * FROM recycle_commits WHERE LOWER(abandoned_node) = LOWER(?)'),
  delete: db.prepare('DELETE FROM recycle_commits WHERE LOWER(abandoned_node) = LOWER(?)'),
  getAll: db.prepare('SELECT * FROM recycle_commits'),
};

function saveRecycleCommit(abandonedNode, salt, commitBlock) {
  const now = new Date().toISOString();
  recycleStatements.upsert.run(abandonedNode, salt, commitBlock, now, salt, commitBlock, now);
}

function getRecycleCommit(abandonedNode) {
  return recycleStatements.get.get(abandonedNode) || null;
}

function deleteRecycleCommit(abandonedNode) {
  recycleStatements.delete.run(abandonedNode);
}

function getAllRecycleCommits() {
  return recycleStatements.getAll.all();
}

// ============ Statistics ============

function getStats() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const notifCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE notifications_enabled = 1').get();
  const lastBlock = getLastProcessedBlock();

  return {
    totalUsers: userCount.count,
    usersWithNotifications: notifCount.count,
    lastProcessedBlock: lastBlock,
  };
}

module.exports = {
  // User operations
  getUser,
  getUserByWallet,
  getAllUsers,
  getAllUsersWithNotifications,
  saveUser,
  toggleNotifications,
  updateLastReminder,
  deleteUser,

  // Block tracking
  getLastProcessedBlock,
  setLastProcessedBlock,

  // Event deduplication
  isEventProcessed,
  markEventProcessed,

  // Email
  setUserEmail,

  // Link challenges
  saveChallenge,
  getChallenge,
  deleteChallenge,

  // Successors
  upsertSuccessor,
  getOwnersBySuccessor,

  // Rate limiting (persistent)
  checkAndIncrementRateLimit,

  // Recycle commits (commit-reveal MEV protection)
  saveRecycleCommit,
  getRecycleCommit,
  deleteRecycleCommit,
  getAllRecycleCommits,

  // Stats
  getStats,

  // Direct DB access (for advanced queries)
  db,
};
