/**
 * Semantic regression fixtures for vault status classification.
 *
 * These tests encode the CANONICAL behavior of Dashboard status logic:
 *   0 = UNREGISTERED  (lastActivityTimestamp === 0)
 *   1 = ACTIVE        (timeUntilInactive > 0, > 7 days)
 *   2 = WARNING       (timeUntilInactive > 0, <= 7 days)
 *   3 = GRACE         (timeUntilInactive === 0, timeUntilAbandoned > 0)
 *   4 = ABANDONED     (timeUntilAbandoned === 0, lastActivityTimestamp > 0)
 *
 * If any of these tests break, the frontend status model has diverged
 * from the smart contract state machine.
 */

import { describe, it, expect } from 'vitest'
import { getStatusClass, getStatusKey } from '../utils/vaultStatus'
import type { NodeStateForStatus as NodeState } from '../utils/vaultStatus'

const DAY = 24 * 60 * 60
const WEEK = 7 * DAY

describe('Vault status — UNREGISTERED', () => {
  it('null nodeState → status-inactive + unregistered key', () => {
    expect(getStatusClass(null)).toBe('status-inactive')
    expect(getStatusKey(null)).toBe('dashboard.status_unregistered')
  })

  it('lastActivityTimestamp=0 → status-inactive + unregistered key', () => {
    const s: NodeState = { lastActivityTimestamp: 0, timeUntilInactive: 0, timeUntilAbandoned: 0 }
    expect(getStatusClass(s)).toBe('status-inactive')
    expect(getStatusKey(s)).toBe('dashboard.status_unregistered')
  })
})

describe('Vault status — ACTIVE', () => {
  it('plenty of time left → status-active', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: 30 * DAY,
      timeUntilAbandoned: 60 * DAY,
    }
    expect(getStatusClass(s)).toBe('status-active')
    expect(getStatusKey(s)).toBe('dashboard.status_active')
  })

  it('exactly 8 days left → still status-active (boundary)', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: 8 * DAY,
      timeUntilAbandoned: 38 * DAY,
    }
    expect(getStatusClass(s)).toBe('status-active')
    expect(getStatusKey(s)).toBe('dashboard.status_active')
  })
})

describe('Vault status — WARNING (< 7 days)', () => {
  it('exactly 7 days left → status-warning', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: WEEK,
      timeUntilAbandoned: 37 * DAY,
    }
    expect(getStatusClass(s)).toBe('status-warning')
    expect(getStatusKey(s)).toBe('dashboard.status_warning')
  })

  it('1 day left → status-warning', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: DAY,
      timeUntilAbandoned: 31 * DAY,
    }
    expect(getStatusClass(s)).toBe('status-warning')
    expect(getStatusKey(s)).toBe('dashboard.status_warning')
  })
})

describe('Vault status — GRACE / CLAIMABLE', () => {
  it('inactivity passed but not abandoned → status-danger + grace key', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: 0,
      timeUntilAbandoned: 15 * DAY,
    }
    expect(getStatusClass(s)).toBe('status-danger')
    expect(getStatusKey(s)).toBe('dashboard.status_grace')
  })

  it('1 second until abandoned → still grace', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: 0,
      timeUntilAbandoned: 1,
    }
    expect(getStatusClass(s)).toBe('status-danger')
    expect(getStatusKey(s)).toBe('dashboard.status_grace')
  })
})

describe('Vault status — ABANDONED', () => {
  it('timeUntilAbandoned=0 and registered → status-danger + abandoned key', () => {
    const s: NodeState = {
      lastActivityTimestamp: 1_700_000_000,
      timeUntilInactive: 0,
      timeUntilAbandoned: 0,
    }
    expect(getStatusClass(s)).toBe('status-danger')
    expect(getStatusKey(s)).toBe('dashboard.status_abandoned')
  })
})

describe('Status class/key consistency', () => {
  it('UNREGISTERED always has status-inactive class (not warning or danger)', () => {
    // UNREGISTERED should prompt user to register, not alarm them
    expect(getStatusClass(null)).toBe('status-inactive')
    expect(getStatusClass({ lastActivityTimestamp: 0, timeUntilInactive: 0, timeUntilAbandoned: 0 })).toBe('status-inactive')
  })

  it('GRACE always has status-danger class (same as ABANDONED)', () => {
    const grace: NodeState = { lastActivityTimestamp: 1, timeUntilInactive: 0, timeUntilAbandoned: 100 }
    const abandoned: NodeState = { lastActivityTimestamp: 1, timeUntilInactive: 0, timeUntilAbandoned: 0 }
    expect(getStatusClass(grace)).toBe('status-danger')
    expect(getStatusClass(abandoned)).toBe('status-danger')
  })
})
