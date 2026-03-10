/**
 * Tests for pure timer/status logic extracted from frontend/src/app.js
 * (no DOM, no wallet — pure functions only)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Constants (mirrors app.js) ──
const VAULT_STATUS = { UNREGISTERED: 0, ACTIVE: 1, GRACE: 2, CLAIMABLE: 3, ABANDONED: 4 };
const GRACE_SECS = 30 * 86400;
const CLAIM_SECS = 30 * 86400;

// ── Pure timer logic extracted from updateTimer() ──

/**
 * Given vault state + status, computes:
 * - displayText: what the timer would show
 * - barPct: progress bar percentage (0-100)
 * - urgency: 'danger' | 'warning' | 'normal' | 'hint' | 'abandoned'
 */
function computeTimerState(state, vaultStatus) {
  const secsUntilInactive  = Number(state.timeUntilInactive);
  const secsUntilAbandoned = Number(state.timeUntilAbandoned);
  const periodSec = Number(state.inactivityPeriod);
  const totalSec  = periodSec + GRACE_SECS + CLAIM_SECS;
  const status    = Number(vaultStatus);

  if (status === VAULT_STATUS.UNREGISTERED) {
    return { displayText: 'hint', barPct: 0, urgency: 'hint' };
  }
  if (status === VAULT_STATUS.ABANDONED) {
    return { displayText: 'recycled', barPct: 0, urgency: 'abandoned' };
  }

  let secsLeft, totalRef;
  if (status === VAULT_STATUS.ACTIVE) {
    secsLeft = secsUntilInactive;
    totalRef = periodSec;
  } else {
    secsLeft = secsUntilAbandoned;
    totalRef = totalSec;
  }

  if (secsLeft <= 0) {
    return { displayText: 'overdue', barPct: 2, urgency: 'danger' };
  }

  const daysLeft  = Math.floor(secsLeft / 86400);
  const hoursLeft = Math.floor((secsLeft % 86400) / 3600);
  const displayText = daysLeft > 0
    ? `${daysLeft}d ${hoursLeft}h`
    : `${hoursLeft}h`;

  const pct = totalRef > 0 ? Math.min(100, (secsLeft / totalRef) * 100) : 100;

  let urgency;
  if (pct < 15 || status !== VAULT_STATUS.ACTIVE) {
    urgency = 'danger';
  } else if (pct < 35) {
    urgency = 'warning';
  } else {
    urgency = 'normal';
  }

  return { displayText, barPct: pct, urgency };
}

// ── Pure status badge logic extracted from updateStatusBadge() ──

function computeStatusBadge(vaultStatus) {
  const status = Number(vaultStatus);
  const map = {
    [VAULT_STATUS.UNREGISTERED]: { cssClass: 'status-warning', i18nKey: 'status.unregistered' },
    [VAULT_STATUS.ACTIVE]:       { cssClass: 'status-active',  i18nKey: 'status.active' },
    [VAULT_STATUS.GRACE]:        { cssClass: 'status-warning', i18nKey: 'status.grace' },
    [VAULT_STATUS.CLAIMABLE]:    { cssClass: 'status-danger',  i18nKey: 'status.claimable' },
    [VAULT_STATUS.ABANDONED]:    { cssClass: 'status-danger',  i18nKey: 'status.abandoned' },
  };
  return map[status] ?? { cssClass: 'status-danger', i18nKey: 'status.abandoned' };
}

// ── Pure timeline logic extracted from updateTimeline() ──

function computeTimeline(vaultStatus) {
  const status = Number(vaultStatus);
  const result = { active: '', grace: '', claim: '', burn: '' };

  if (status === VAULT_STATUS.ACTIVE || status === VAULT_STATUS.UNREGISTERED) {
    result.active = 'active';
  } else if (status === VAULT_STATUS.GRACE) {
    result.active = 'active';
    result.grace  = 'warning';
  } else if (status === VAULT_STATUS.CLAIMABLE) {
    result.active = 'active';
    result.grace  = 'active';
    result.claim  = 'warning';
  } else if (status === VAULT_STATUS.ABANDONED) {
    result.active = 'active';
    result.grace  = 'active';
    result.claim  = 'active';
    result.burn   = 'danger';
  }
  return result;
}

// ── Helpers ──
const PERIOD_90 = 90 * 86400;

function makeActiveState(secsUntilInactive) {
  return { timeUntilInactive: secsUntilInactive, timeUntilAbandoned: 0, inactivityPeriod: PERIOD_90 };
}

function makeGraceState(secsUntilAbandoned) {
  return { timeUntilInactive: 0, timeUntilAbandoned: secsUntilAbandoned, inactivityPeriod: PERIOD_90 };
}

// ──────────────────────────────────────────────
// computeTimerState tests
// ──────────────────────────────────────────────
describe('computeTimerState — UNREGISTERED', () => {
  test('returns hint urgency with 0% bar', () => {
    const r = computeTimerState(makeActiveState(0), VAULT_STATUS.UNREGISTERED);
    assert.equal(r.urgency, 'hint');
    assert.equal(r.barPct, 0);
  });
});

describe('computeTimerState — ABANDONED', () => {
  test('returns abandoned urgency with 0% bar', () => {
    const r = computeTimerState(makeActiveState(0), VAULT_STATUS.ABANDONED);
    assert.equal(r.urgency, 'abandoned');
    assert.equal(r.barPct, 0);
    assert.equal(r.displayText, 'recycled');
  });
});

describe('computeTimerState — ACTIVE', () => {
  test('full time remaining → 100% bar, normal urgency', () => {
    const r = computeTimerState(makeActiveState(PERIOD_90), VAULT_STATUS.ACTIVE);
    assert.equal(r.barPct, 100);
    assert.equal(r.urgency, 'normal');
  });

  test('50% time left → 50% bar, normal urgency', () => {
    const r = computeTimerState(makeActiveState(PERIOD_90 / 2), VAULT_STATUS.ACTIVE);
    assert.ok(Math.abs(r.barPct - 50) < 0.01);
    assert.equal(r.urgency, 'normal');
  });

  test('30% time left → warning urgency (between 15-35%)', () => {
    const r = computeTimerState(makeActiveState(Math.floor(PERIOD_90 * 0.30)), VAULT_STATUS.ACTIVE);
    assert.equal(r.urgency, 'warning');
  });

  test('10% time left → danger urgency (below 15%)', () => {
    const r = computeTimerState(makeActiveState(Math.floor(PERIOD_90 * 0.10)), VAULT_STATUS.ACTIVE);
    assert.equal(r.urgency, 'danger');
  });

  test('secsLeft=0 → overdue, 2% bar, danger', () => {
    const r = computeTimerState(makeActiveState(0), VAULT_STATUS.ACTIVE);
    assert.equal(r.displayText, 'overdue');
    assert.equal(r.barPct, 2);
    assert.equal(r.urgency, 'danger');
  });

  test('displayText shows days and hours for > 1 day', () => {
    const r = computeTimerState(makeActiveState(5 * 86400 + 3 * 3600), VAULT_STATUS.ACTIVE);
    assert.equal(r.displayText, '5d 3h');
  });

  test('displayText shows only hours for < 1 day', () => {
    const r = computeTimerState(makeActiveState(7 * 3600), VAULT_STATUS.ACTIVE);
    assert.equal(r.displayText, '7h');
  });

  test('exactly 1 day remaining shows "1d 0h"', () => {
    const r = computeTimerState(makeActiveState(86400), VAULT_STATUS.ACTIVE);
    assert.equal(r.displayText, '1d 0h');
  });
});

describe('computeTimerState — GRACE', () => {
  test('GRACE always returns danger urgency regardless of pct', () => {
    const totalTimeout = PERIOD_90 + GRACE_SECS + CLAIM_SECS;
    // Lots of time left, but still in GRACE → danger
    const r = computeTimerState(makeGraceState(totalTimeout * 0.9), VAULT_STATUS.GRACE);
    assert.equal(r.urgency, 'danger');
  });

  test('bar pct uses totalTimeout as reference in GRACE', () => {
    const totalTimeout = PERIOD_90 + GRACE_SECS + CLAIM_SECS;
    const r = computeTimerState(makeGraceState(totalTimeout / 2), VAULT_STATUS.GRACE);
    assert.ok(Math.abs(r.barPct - 50) < 0.01);
  });
});

describe('computeTimerState — CLAIMABLE', () => {
  test('CLAIMABLE always returns danger urgency', () => {
    const r = computeTimerState(makeGraceState(CLAIM_SECS), VAULT_STATUS.CLAIMABLE);
    assert.equal(r.urgency, 'danger');
  });
});

describe('computeTimerState — bar never exceeds 100%', () => {
  test('barPct capped at 100 even if secsLeft > totalRef', () => {
    // Simulate edge case where more time left than period (shouldn't happen but guard anyway)
    const state = { timeUntilInactive: PERIOD_90 * 2, timeUntilAbandoned: 0, inactivityPeriod: PERIOD_90 };
    const r = computeTimerState(state, VAULT_STATUS.ACTIVE);
    assert.ok(r.barPct <= 100);
  });
});

// ──────────────────────────────────────────────
// computeStatusBadge tests
// ──────────────────────────────────────────────
describe('computeStatusBadge', () => {
  test('UNREGISTERED → status-warning', () => {
    const r = computeStatusBadge(VAULT_STATUS.UNREGISTERED);
    assert.equal(r.cssClass, 'status-warning');
    assert.equal(r.i18nKey, 'status.unregistered');
  });

  test('ACTIVE → status-active', () => {
    const r = computeStatusBadge(VAULT_STATUS.ACTIVE);
    assert.equal(r.cssClass, 'status-active');
    assert.equal(r.i18nKey, 'status.active');
  });

  test('GRACE → status-warning', () => {
    const r = computeStatusBadge(VAULT_STATUS.GRACE);
    assert.equal(r.cssClass, 'status-warning');
    assert.equal(r.i18nKey, 'status.grace');
  });

  test('CLAIMABLE → status-danger', () => {
    const r = computeStatusBadge(VAULT_STATUS.CLAIMABLE);
    assert.equal(r.cssClass, 'status-danger');
    assert.equal(r.i18nKey, 'status.claimable');
  });

  test('ABANDONED → status-danger', () => {
    const r = computeStatusBadge(VAULT_STATUS.ABANDONED);
    assert.equal(r.cssClass, 'status-danger');
    assert.equal(r.i18nKey, 'status.abandoned');
  });

  test('unknown status falls back to danger/abandoned', () => {
    const r = computeStatusBadge(99);
    assert.equal(r.cssClass, 'status-danger');
  });
});

// ──────────────────────────────────────────────
// computeTimeline tests
// ──────────────────────────────────────────────
describe('computeTimeline', () => {
  test('UNREGISTERED: only active segment highlighted', () => {
    const r = computeTimeline(VAULT_STATUS.UNREGISTERED);
    assert.equal(r.active, 'active');
    assert.equal(r.grace,  '');
    assert.equal(r.claim,  '');
    assert.equal(r.burn,   '');
  });

  test('ACTIVE: only active segment highlighted', () => {
    const r = computeTimeline(VAULT_STATUS.ACTIVE);
    assert.equal(r.active, 'active');
    assert.equal(r.grace,  '');
  });

  test('GRACE: active + grace warning', () => {
    const r = computeTimeline(VAULT_STATUS.GRACE);
    assert.equal(r.active, 'active');
    assert.equal(r.grace,  'warning');
    assert.equal(r.claim,  '');
  });

  test('CLAIMABLE: active + grace active + claim warning', () => {
    const r = computeTimeline(VAULT_STATUS.CLAIMABLE);
    assert.equal(r.active, 'active');
    assert.equal(r.grace,  'active');
    assert.equal(r.claim,  'warning');
    assert.equal(r.burn,   '');
  });

  test('ABANDONED: all segments lit, burn = danger', () => {
    const r = computeTimeline(VAULT_STATUS.ABANDONED);
    assert.equal(r.active, 'active');
    assert.equal(r.grace,  'active');
    assert.equal(r.claim,  'active');
    assert.equal(r.burn,   'danger');
  });

  test('unknown status: all segments empty', () => {
    const r = computeTimeline(99);
    assert.equal(r.active, '');
    assert.equal(r.grace,  '');
    assert.equal(r.claim,  '');
    assert.equal(r.burn,   '');
  });
});
