/**
 * Validates shared/fixtures/canonical-states.json against actual vault-status logic.
 *
 * Ensures the canonical executable spec stays in sync with:
 *   - shared/vault-status.js (status derivation)
 *   - WillChain.sol VaultStatus enum values
 *   - Time constants
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { VAULT_STATUS, deriveVaultStatus, needsCriticalAlert, approachingInactivity } = require('../shared/vault-status.js');
const fixtures = require('../shared/fixtures/canonical-states.json');

// ── Constants validation ───────────────────────────────────────────────

describe('Canonical fixtures — constants consistency', () => {
  const c = fixtures._meta.constants;

  test('DAY = 86400', () => {
    assert.equal(c.DAY, 86400);
  });

  test('time periods match contract values', () => {
    assert.equal(c.PERIOD_30_DAYS, 30 * 86400);
    assert.equal(c.PERIOD_90_DAYS, 90 * 86400);
    assert.equal(c.PERIOD_180_DAYS, 180 * 86400);
    assert.equal(c.PERIOD_365_DAYS, 365 * 86400);
    assert.equal(c.DEFAULT_INACTIVITY_PERIOD, c.PERIOD_90_DAYS);
  });

  test('grace + claim + inactivity = total timeout', () => {
    assert.equal(
      c.TOTAL_TIMEOUT_DEFAULT,
      c.DEFAULT_INACTIVITY_PERIOD + c.GRACE_PERIOD + c.CLAIM_PERIOD,
    );
  });

  test('recycle distribution sums to 10000 BPS', () => {
    assert.equal(
      c.MAINTAINER_REWARD_BPS + c.PROTOCOL_FEE_BPS + c.BURN_BPS + c.RECYCLE_BPS,
      10000,
    );
  });

  test('commit-reveal window = 1 day', () => {
    assert.equal(c.COMMIT_REVEAL_WINDOW, 86400);
  });
});

// ── States validation ──────────────────────────────────────────────────

describe('Canonical fixtures — state status matches deriveVaultStatus()', () => {
  for (const state of fixtures.states) {
    if (!state.nodeState) continue; // null nodeState = no contract data to derive from

    test(`${state.id}: status=${state.status} (${state.statusName})`, () => {
      const derived = deriveVaultStatus(state.nodeState);

      // CLAIMABLE is mapped to GRACE by deriveVaultStatus (simplified for alerting)
      if (state.status === VAULT_STATUS.CLAIMABLE) {
        assert.equal(derived.status, VAULT_STATUS.GRACE,
          `${state.id}: CLAIMABLE should map to GRACE in deriveVaultStatus`);
        assert.equal(derived.inGrace, true);
      } else {
        assert.equal(derived.status, state.status,
          `${state.id}: expected status ${state.status}, got ${derived.status}`);
      }
    });
  }
});

// ── Status enum completeness ───────────────────────────────────────────

describe('Canonical fixtures — all 5 statuses covered', () => {
  test('every VaultStatus value has at least one fixture', () => {
    const coveredStatuses = new Set(fixtures.states.map(s => s.status));
    for (const [name, value] of Object.entries(VAULT_STATUS)) {
      assert.ok(coveredStatuses.has(value), `Missing fixture for status ${name} (${value})`);
    }
  });
});

// ── Transitions validation ─────────────────────────────────────────────

describe('Canonical fixtures — transitions reference valid states', () => {
  const stateIds = new Set(fixtures.states.map(s => s.id));

  for (const state of fixtures.states) {
    if (!state.transitions) continue;
    for (const target of state.transitions) {
      test(`${state.id} → ${target} exists`, () => {
        assert.ok(stateIds.has(target), `Transition target ${target} not found in states`);
      });
    }
  }
});

// ── Invariants listed ──────────────────────────────────────────────────

describe('Canonical fixtures — invariants', () => {
  test('at least 10 invariants listed', () => {
    assert.ok(fixtures.invariants.length >= 10,
      `Expected >= 10 invariants, got ${fixtures.invariants.length}`);
  });

  test('every invariant has an ID prefix', () => {
    for (const inv of fixtures.invariants) {
      assert.match(inv, /^INV\d{2}:/, `Invariant missing ID prefix: ${inv}`);
    }
  });
});

// ── Alert behavior matches fixtures ────────────────────────────────────

describe('Canonical fixtures — alert behavior', () => {
  test('GRACE fixtures trigger critical alert', () => {
    const grace = fixtures.states.find(s => s.id === 'S06_GRACE');
    assert.ok(grace, 'S06_GRACE fixture not found');
    assert.equal(needsCriticalAlert(grace.nodeState), true);
  });

  test('ABANDONED fixtures trigger critical alert', () => {
    const abandoned = fixtures.states.find(s => s.id === 'S09_ABANDONED');
    assert.ok(abandoned, 'S09_ABANDONED fixture not found');
    assert.equal(needsCriticalAlert(abandoned.nodeState), true);
  });

  test('ACTIVE fixtures do not trigger critical alert', () => {
    const active = fixtures.states.find(s => s.id === 'S04_ACTIVE_WITH_SUCCESSOR');
    assert.ok(active, 'S04 fixture not found');
    assert.equal(needsCriticalAlert(active.nodeState), false);
  });

  test('WARNING fixture triggers approachingInactivity', () => {
    const warning = fixtures.states.find(s => s.id === 'S05_ACTIVE_WARNING');
    assert.ok(warning, 'S05 fixture not found');
    assert.equal(approachingInactivity(warning.nodeState), true);
  });

  test('UNREGISTERED does not trigger critical alert', () => {
    const unreg = fixtures.states.find(s => s.id === 'S02_UNREGISTERED_ZERO');
    assert.ok(unreg, 'S02 fixture not found');
    assert.equal(needsCriticalAlert(unreg.nodeState), false);
  });
});
