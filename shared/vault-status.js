/**
 * @file vault-status.js
 * Canonical source of truth for WillChain vault status logic.
 *
 * Used by: bot/src/index.js, scripts/check-stats.js, scripts/observer/
 *
 * VaultStatus enum (mirrors WillChain.sol):
 *   0 = UNREGISTERED  — never called confirmActivity()
 *   1 = ACTIVE        — registered and within inactivity period
 *   2 = GRACE         — past inactivity period, successor claim window open
 *   3 = CLAIMABLE     — claim initiated, veto period passed
 *   4 = ABANDONED     — total timeout expired, anyone can recycle
 *
 * Key invariants (from contract):
 *   - isActive (contract field) is TRUE for ACTIVE and GRACE only
 *     → UNREGISTERED returns isActive = false (fixed 2026-03-07)
 *   - Use timeUntilInactive === 0 + timeUntilAbandoned > 0 for GRACE/CLAIMABLE
 *   - UNREGISTERED: lastActivityTimestamp === 0
 *   - Transfers do NOT auto-register a user — must call confirmActivity()
 *   - Only DIRECT transfers (msg.sender == from) reset the inactivity timer (M-01 fix)
 *   - transferFrom() by third-party spenders does NOT reset the timer
 */

'use strict';

const VAULT_STATUS = Object.freeze({
  UNREGISTERED: 0,
  ACTIVE:       1,
  GRACE:        2,
  CLAIMABLE:    3,
  ABANDONED:    4,
});

const VAULT_STATUS_NAMES = Object.freeze([
  'UNREGISTERED', // 0
  'ACTIVE',       // 1
  'GRACE',        // 2
  'CLAIMABLE',    // 3
  'ABANDONED',    // 4
]);

/**
 * Derive human-readable vault status from getNodeState() output.
 * Avoids relying on state.isActive which is true for ACTIVE+GRACE+UNREGISTERED.
 *
 * @param {object} state - Return value of contract.getNodeState(address)
 * @returns {{ status: number, name: string, inGrace: boolean, isAbandoned: boolean, isUnregistered: boolean }}
 */
function deriveVaultStatus(state) {
  const lastActivity   = BigInt(state.lastActivityTimestamp ?? 0n);
  const timeUntilInactive  = BigInt(state.timeUntilInactive  ?? 0n);
  const timeUntilAbandoned = BigInt(state.timeUntilAbandoned ?? 0n);

  const isUnregistered = lastActivity === 0n;
  const isAbandoned    = !isUnregistered && timeUntilAbandoned === 0n;
  const inGrace        = !isUnregistered && !isAbandoned && timeUntilInactive === 0n;
  const isActive       = !isUnregistered && !isAbandoned && !inGrace;

  let status;
  if (isUnregistered) {
    status = VAULT_STATUS.UNREGISTERED;
  } else if (isAbandoned) {
    status = VAULT_STATUS.ABANDONED;
  } else if (inGrace) {
    // Could be GRACE or CLAIMABLE depending on successorClaimInitiated + veto window
    // Both are covered by inGrace for alerting purposes; use raw contract getVaultStatus for precision
    status = VAULT_STATUS.GRACE;
  } else {
    status = VAULT_STATUS.ACTIVE;
  }

  return { status, name: VAULT_STATUS_NAMES[status], inGrace, isAbandoned, isUnregistered, isActive };
}

/**
 * Map a raw numeric status (from contract.getVaultStatus()) to its name.
 * @param {number|bigint} n
 * @returns {string}
 */
function statusName(n) {
  return VAULT_STATUS_NAMES[Number(n)] ?? `UNKNOWN(${n})`;
}

/**
 * Returns true if the vault needs a critical alert (GRACE or ABANDONED).
 * @param {object} state - getNodeState() output
 */
function needsCriticalAlert(state) {
  const { inGrace, isAbandoned } = deriveVaultStatus(state);
  return inGrace || isAbandoned;
}

/**
 * Returns true if the vault is approaching inactivity (within N days).
 * @param {object} state - getNodeState() output
 * @param {number} thresholdDays
 */
function approachingInactivity(state, thresholdDays = 7) {
  const { isActive } = deriveVaultStatus(state);
  if (!isActive) return false;
  const days = Math.floor(Number(state.timeUntilInactive) / 86400);
  return days <= thresholdDays;
}

module.exports = {
  VAULT_STATUS,
  VAULT_STATUS_NAMES,
  deriveVaultStatus,
  statusName,
  needsCriticalAlert,
  approachingInactivity,
};
