/**
 * Dev-only mock for testing claim UI without waiting 30+ days.
 *
 * Usage: add ?mock=claim to URL
 *   - ?mock=claim        → owner vault in CLAIMABLE state (past grace, in claim window)
 *   - ?mock=grace         → owner vault in GRACE state
 *   - ?mock=claim-started → claim already initiated, veto period active
 *
 * Only affects the hardcoded MOCK_OWNER address.
 * Remove this file before mainnet.
 */

import { GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS } from '../config/contract'

const MOCK_OWNER = '0x8d0d09F816815c4e583Fa96E4dAd20d20Ac33FAA'.toLowerCase()
const MOCK_SUCCESSOR = '0xd6C438b457baDfD51AcA94aD52f7FD9cB1dd9185'.toLowerCase()
const INACTIVITY_PERIOD = 90 * 24 * 60 * 60 // 90 days

type MockMode = 'claim' | 'grace' | 'claim-started' | null

export function getMockMode(): MockMode {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search).get('mock')
  if (p === 'claim' || p === 'grace' || p === 'claim-started') return p
  return null
}

function mockLastActivity(mode: MockMode): number {
  const now = Math.floor(Date.now() / 1000)
  switch (mode) {
    case 'grace':
      // 1 day into grace period
      return now - INACTIVITY_PERIOD - 1 * 24 * 60 * 60
    case 'claim':
      // 1 day into claim window (past grace)
      return now - INACTIVITY_PERIOD - GRACE_PERIOD_SECONDS - 1 * 24 * 60 * 60
    case 'claim-started':
      // inactive + claim initiated 2 days ago
      return now - INACTIVITY_PERIOD - GRACE_PERIOD_SECONDS - 1 * 24 * 60 * 60
    default:
      return 0
  }
}

/**
 * Mock override for useNodeState return value.
 * Returns null if mock is not active or address doesn't match.
 */
export function mockNodeState(address: string | undefined) {
  const mode = getMockMode()
  if (!mode || !address || address.toLowerCase() !== MOCK_OWNER) return null

  const now = Math.floor(Date.now() / 1000)
  const lastActivity = mockLastActivity(mode)
  const isClaimStarted = mode === 'claim-started'
  const claimTimestamp = isClaimStarted ? now - 2 * 24 * 60 * 60 : 0

  return {
    lastActivityTimestamp: lastActivity,
    designatedSuccessor: MOCK_SUCCESSOR,
    successorClaimInitiated: isClaimStarted,
    claimInitiationTimestamp: claimTimestamp,
    timeUntilInactive: 0,
    timeUntilAbandoned: 0,
    isActive: false,
    serviceTier: 'Basic Vault',
    inactivityPeriod: INACTIVITY_PERIOD,
  }
}

/**
 * Mock override for nodeStates (raw storage) return value.
 * Used by IncomingInheritancesCard and DashboardAlerts.
 * Returns a tuple matching the contract's nodeStates output.
 */
export function mockNodeStatesResult(ownerAddress: string) {
  const mode = getMockMode()
  if (!mode || ownerAddress.toLowerCase() !== MOCK_OWNER) return null

  const now = Math.floor(Date.now() / 1000)
  const lastActivity = mockLastActivity(mode)
  const isClaimStarted = mode === 'claim-started'
  const claimTimestamp = isClaimStarted ? now - 2 * 24 * 60 * 60 : 0

  // nodeStates returns: [lastActivityTimestamp, claimInitiationTimestamp, inactivityPeriod, vaultDataHash, designatedSuccessor, successorClaimInitiated]
  return [
    BigInt(lastActivity),
    BigInt(claimTimestamp),
    BigInt(INACTIVITY_PERIOD),
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    MOCK_SUCCESSOR,
    isClaimStarted,
  ]
}
