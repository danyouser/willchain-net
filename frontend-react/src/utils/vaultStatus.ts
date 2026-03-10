/**
 * Shared vault status derivation for frontend components.
 *
 * Single source of truth for status classification from contract's
 * getNodeState() return values (timeUntilInactive, timeUntilAbandoned).
 *
 * Used by: Dashboard.tsx, vaultStatus.test.ts
 * See also: shared/vault-status.js (bot/scripts equivalent)
 */

export const VAULT_STATUS = {
  UNREGISTERED: 0,
  ACTIVE: 1,
  GRACE: 2,
  CLAIMABLE: 3,
  ABANDONED: 4,
} as const

export type VaultStatusCode = typeof VAULT_STATUS[keyof typeof VAULT_STATUS]

const DAY = 24 * 60 * 60
const WEEK = 7 * DAY

export interface NodeStateForStatus {
  lastActivityTimestamp: number
  timeUntilInactive: number
  timeUntilAbandoned: number
}

export type StatusClass = 'status-inactive' | 'status-danger' | 'status-warning' | 'status-active'

/**
 * Derive CSS class for vault status badge.
 *
 * - status-inactive: UNREGISTERED
 * - status-active: ACTIVE with > 7 days remaining
 * - status-warning: ACTIVE with <= 7 days remaining
 * - status-danger: GRACE, CLAIMABLE, or ABANDONED
 */
export function getStatusClass(nodeState: NodeStateForStatus | null): StatusClass {
  if (!nodeState || nodeState.lastActivityTimestamp === 0) return 'status-inactive'
  const inGraceOrClaimable =
    nodeState.lastActivityTimestamp > 0 &&
    nodeState.timeUntilInactive === 0 &&
    nodeState.timeUntilAbandoned > 0
  if (inGraceOrClaimable || nodeState.timeUntilAbandoned === 0) return 'status-danger'
  if (nodeState.timeUntilInactive <= WEEK) return 'status-warning'
  return 'status-active'
}

/**
 * Derive i18n key for vault status text.
 */
export function getStatusKey(nodeState: NodeStateForStatus | null): string {
  if (!nodeState || nodeState.lastActivityTimestamp === 0) return 'dashboard.status_unregistered'
  const inGraceOrClaimable =
    nodeState.lastActivityTimestamp > 0 &&
    nodeState.timeUntilInactive === 0 &&
    nodeState.timeUntilAbandoned > 0
  if (inGraceOrClaimable) return 'dashboard.status_grace'
  if (nodeState.timeUntilAbandoned === 0) return 'dashboard.status_abandoned'
  if (nodeState.timeUntilInactive <= WEEK) return 'dashboard.status_warning'
  return 'dashboard.status_active'
}

/**
 * Check if vault is in GRACE or CLAIMABLE state
 * (past inactivity period but not yet abandoned).
 */
export function isInGraceOrClaimable(nodeState: NodeStateForStatus | null): boolean {
  if (!nodeState || nodeState.lastActivityTimestamp === 0) return false
  return nodeState.timeUntilInactive === 0 && nodeState.timeUntilAbandoned > 0
}
