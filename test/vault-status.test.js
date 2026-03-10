/**
 * Semantic regression fixtures for shared/vault-status.js
 *
 * These are golden-case tests that encode the CANONICAL behavior
 * of deriveVaultStatus() for all 5 states. If any test breaks,
 * the shared status engine has diverged — all off-chain clients
 * (bot, observer, check-stats) are affected.
 *
 * Must stay in sync with:
 *   - WillChain.sol VaultStatus enum
 *   - Dashboard.tsx status logic
 *   - phoenix_observer.py status checks
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  VAULT_STATUS,
  deriveVaultStatus,
  statusName,
  needsCriticalAlert,
  approachingInactivity,
} = require('../shared/vault-status.js');

const DAY = 86400n;
const WEEK = 7n * DAY;

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** State snapshots for each canonical vault status */
const FIXTURES = {
  UNREGISTERED: {
    lastActivityTimestamp: 0n,
    timeUntilInactive: 0n,
    timeUntilAbandoned: 0n,
  },
  ACTIVE: {
    lastActivityTimestamp: 1_700_000_000n,
    timeUntilInactive: 30n * DAY,
    timeUntilAbandoned: 60n * DAY,
  },
  ACTIVE_WARNING: {          // < 7 days left
    lastActivityTimestamp: 1_700_000_000n,
    timeUntilInactive: 3n * DAY,
    timeUntilAbandoned: 33n * DAY,
  },
  GRACE: {
    lastActivityTimestamp: 1_700_000_000n,
    timeUntilInactive: 0n,
    timeUntilAbandoned: 15n * DAY,
  },
  ABANDONED: {
    lastActivityTimestamp: 1_700_000_000n,
    timeUntilInactive: 0n,
    timeUntilAbandoned: 0n,
  },
};

// ── deriveVaultStatus ─────────────────────────────────────────────────────────

describe('deriveVaultStatus — UNREGISTERED', () => {
  test('status = 0, name = UNREGISTERED', () => {
    const r = deriveVaultStatus(FIXTURES.UNREGISTERED);
    assert.equal(r.status, VAULT_STATUS.UNREGISTERED);
    assert.equal(r.name, 'UNREGISTERED');
    assert.equal(r.isUnregistered, true);
    assert.equal(r.inGrace, false);
    assert.equal(r.isAbandoned, false);
    assert.equal(r.isActive, false);
  });

  test('numeric 0 timestamps also work (not just BigInt)', () => {
    const r = deriveVaultStatus({ lastActivityTimestamp: 0, timeUntilInactive: 0, timeUntilAbandoned: 0 });
    assert.equal(r.status, VAULT_STATUS.UNREGISTERED);
  });
});

describe('deriveVaultStatus — ACTIVE', () => {
  test('plenty of time → status = 1, isActive = true', () => {
    const r = deriveVaultStatus(FIXTURES.ACTIVE);
    assert.equal(r.status, VAULT_STATUS.ACTIVE);
    assert.equal(r.name, 'ACTIVE');
    assert.equal(r.isActive, true);
    assert.equal(r.isUnregistered, false);
    assert.equal(r.inGrace, false);
    assert.equal(r.isAbandoned, false);
  });

  test('exactly 8 days left → still ACTIVE (boundary)', () => {
    const r = deriveVaultStatus({
      lastActivityTimestamp: 1_700_000_000n,
      timeUntilInactive: 8n * DAY,
      timeUntilAbandoned: 38n * DAY,
    });
    assert.equal(r.status, VAULT_STATUS.ACTIVE);
  });
});

describe('deriveVaultStatus — GRACE', () => {
  test('inactivity passed, not abandoned → status = 2, inGrace = true', () => {
    const r = deriveVaultStatus(FIXTURES.GRACE);
    assert.equal(r.status, VAULT_STATUS.GRACE);
    assert.equal(r.name, 'GRACE');
    assert.equal(r.inGrace, true);
    assert.equal(r.isAbandoned, false);
    assert.equal(r.isUnregistered, false);
  });

  test('1 second until abandoned → still GRACE', () => {
    const r = deriveVaultStatus({
      lastActivityTimestamp: 1_700_000_000n,
      timeUntilInactive: 0n,
      timeUntilAbandoned: 1n,
    });
    assert.equal(r.status, VAULT_STATUS.GRACE);
    assert.equal(r.inGrace, true);
  });
});

describe('deriveVaultStatus — ABANDONED', () => {
  test('timeUntilAbandoned=0, registered → status = 4, isAbandoned = true', () => {
    const r = deriveVaultStatus(FIXTURES.ABANDONED);
    assert.equal(r.status, VAULT_STATUS.ABANDONED);
    assert.equal(r.name, 'ABANDONED');
    assert.equal(r.isAbandoned, true);
    assert.equal(r.inGrace, false);
    assert.equal(r.isActive, false);
    assert.equal(r.isUnregistered, false);
  });
});

// ── statusName ────────────────────────────────────────────────────────────────

describe('statusName', () => {
  test('maps 0-4 to correct names', () => {
    assert.equal(statusName(0), 'UNREGISTERED');
    assert.equal(statusName(1), 'ACTIVE');
    assert.equal(statusName(2), 'GRACE');
    assert.equal(statusName(3), 'CLAIMABLE');
    assert.equal(statusName(4), 'ABANDONED');
  });

  test('BigInt input works', () => {
    assert.equal(statusName(0n), 'UNREGISTERED');
    assert.equal(statusName(4n), 'ABANDONED');
  });

  test('unknown status returns UNKNOWN(n)', () => {
    assert.match(statusName(99), /UNKNOWN/);
  });
});

// ── needsCriticalAlert ────────────────────────────────────────────────────────

describe('needsCriticalAlert', () => {
  test('UNREGISTERED → false (should register, not alarm)', () => {
    assert.equal(needsCriticalAlert(FIXTURES.UNREGISTERED), false);
  });

  test('ACTIVE → false', () => {
    assert.equal(needsCriticalAlert(FIXTURES.ACTIVE), false);
  });

  test('GRACE → true', () => {
    assert.equal(needsCriticalAlert(FIXTURES.GRACE), true);
  });

  test('ABANDONED → true', () => {
    assert.equal(needsCriticalAlert(FIXTURES.ABANDONED), true);
  });
});

// ── approachingInactivity ─────────────────────────────────────────────────────

describe('approachingInactivity', () => {
  test('30 days left → not approaching (default 7-day threshold)', () => {
    assert.equal(approachingInactivity(FIXTURES.ACTIVE), false);
  });

  test('3 days left → approaching', () => {
    assert.equal(approachingInactivity(FIXTURES.ACTIVE_WARNING), true);
  });

  test('exactly 7 days left → approaching (boundary, inclusive)', () => {
    const state = { lastActivityTimestamp: 1n, timeUntilInactive: WEEK, timeUntilAbandoned: 37n * DAY };
    assert.equal(approachingInactivity(state), true);
  });

  test('8 days left → not approaching', () => {
    const state = { lastActivityTimestamp: 1n, timeUntilInactive: 8n * DAY, timeUntilAbandoned: 38n * DAY };
    assert.equal(approachingInactivity(state), false);
  });

  test('GRACE state → false (already past inactivity, different alert)', () => {
    assert.equal(approachingInactivity(FIXTURES.GRACE), false);
  });

  test('ABANDONED → false', () => {
    assert.equal(approachingInactivity(FIXTURES.ABANDONED), false);
  });

  test('custom threshold (14 days)', () => {
    // 10 days left, threshold=14 → approaching
    const state = { lastActivityTimestamp: 1n, timeUntilInactive: 10n * DAY, timeUntilAbandoned: 40n * DAY };
    assert.equal(approachingInactivity(state, 14), true);
    assert.equal(approachingInactivity(state, 7), false);
  });
});

// ── Cross-client consistency ──────────────────────────────────────────────────

describe('Cross-client consistency checks', () => {
  test('UNREGISTERED never triggers critical alert (matches bot + React)', () => {
    // Bot: needsCriticalAlert returns false
    // React Dashboard: statusClass = 'status-warning' (not 'status-danger')
    // → both treat UNREGISTERED as "needs attention but not emergency"
    const result = deriveVaultStatus(FIXTURES.UNREGISTERED);
    assert.equal(result.isUnregistered, true);
    assert.equal(needsCriticalAlert(FIXTURES.UNREGISTERED), false);
  });

  test('GRACE and ABANDONED both trigger critical alert (matches bot + React)', () => {
    assert.equal(needsCriticalAlert(FIXTURES.GRACE), true);
    assert.equal(needsCriticalAlert(FIXTURES.ABANDONED), true);
  });

  test('isAbandoned is exclusive: not possible to be both abandoned and in grace', () => {
    const grace = deriveVaultStatus(FIXTURES.GRACE);
    const abandoned = deriveVaultStatus(FIXTURES.ABANDONED);
    assert.equal(grace.inGrace && grace.isAbandoned, false);
    assert.equal(abandoned.inGrace && abandoned.isAbandoned, false);
  });

  test('exactly one flag is true per state', () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const r = deriveVaultStatus(fixture);
      const flags = [r.isUnregistered, r.isActive, r.inGrace, r.isAbandoned];
      const trueCount = flags.filter(Boolean).length;
      // ACTIVE_WARNING maps to isActive=true so count is 1
      assert.equal(trueCount, 1, `${name}: expected exactly 1 true flag, got ${trueCount} (${JSON.stringify(flags)})`);
    }
  });
});
