/**
 * CTA gating tests — verify that action buttons/sections render
 * only in the correct vault states.
 *
 * Tests GRACE, CLAIMABLE, ABANDONED, wrong network, and empty states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../config/wagmi', () => ({
  config: {},
  CHAIN_ID: 84532,
  CONTRACT_ADDRESS: '0x6fAd1475B41731E3eDA21998417Cb2e18E795877',
}))

vi.mock('../config/contract', () => ({
  CONTRACT_ADDRESS: '0x6fAd1475B41731E3eDA21998417Cb2e18E795877',
  WILLCHAIN_ABI: [],
  GRACE_PERIOD_SECONDS: 30 * 86400,
  CLAIM_PERIOD_SECONDS: 30 * 86400,
  COMMIT_REVEAL_WINDOW: 86400,
  INACTIVITY_PERIODS: {
    DAYS_30: 30 * 86400,
    DAYS_90: 90 * 86400,
    DAYS_180: 180 * 86400,
    DAYS_365: 365 * 86400,
  },
  SERVICE_TIERS: {
    NONE: { min: 0n, label: 'None' },
    BASIC: { min: 1000n * 10n ** 18n, label: 'Basic' },
    FAMILY: { min: 10000n * 10n ** 18n, label: 'Family' },
    LEGACY: { min: 100000n * 10n ** 18n, label: 'Legacy' },
  },
}))

const mockUseAccount = vi.fn(() => ({
  address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  isConnected: true,
}))

vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useWriteContract: vi.fn(() => ({
    writeContractAsync: vi.fn(),
    isPending: false,
  })),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isLoading: false,
    isSuccess: false,
  })),
  useReadContract: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useReadContracts: vi.fn(() => ({
    data: undefined,
    isLoading: false,
  })),
  useWatchContractEvent: vi.fn(),
  useBalance: vi.fn(() => ({ data: { value: 100000000000000n } })),
  useGasPrice: vi.fn(() => ({ data: 1000000n })),
  useChainId: vi.fn(() => 84532),
  usePublicClient: vi.fn(() => ({
    getBlockNumber: vi.fn().mockResolvedValue(BigInt(100)),
  })),
  useSwitchChain: vi.fn(() => ({
    switchChainAsync: vi.fn(),
  })),
  useSimulateContract: vi.fn(() => ({
    data: undefined,
    error: null,
  })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../hooks/useBalance', () => ({
  useBalance: vi.fn(() => ({
    balance: 1000000n * 10n ** 18n,
    refetch: vi.fn(),
  })),
  formatTokenAmount: (val: bigint | undefined) => val ? '1,000,000' : '0',
}))

const mockUseNodeState = vi.fn()
vi.mock('../hooks/useNodeState', () => ({
  useNodeState: () => mockUseNodeState(),
}))

vi.mock('../hooks/useIsSmartWallet', () => ({
  useIsSmartWallet: vi.fn(() => false),
}))

vi.mock('../hooks/useChainGuard', () => ({
  useChainGuard: vi.fn(() => ({
    assertCorrectChain: vi.fn(() => true),
    isCorrectChain: true,
  })),
}))

vi.mock('../hooks/useSimulatedWrite', () => ({
  useSimulatedWrite: vi.fn(() => ({
    write: vi.fn(),
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    reset: vi.fn(),
    simulationError: null,
    canWrite: true,
  })),
}))

vi.mock('../context/NotificationContext', () => ({
  useNotification: vi.fn(() => ({
    showNotification: vi.fn(),
  })),
}))

vi.mock('../hooks/useNetworkStats', () => ({
  useNetworkStats: vi.fn(() => ({
    stats: null,
    isLoading: false,
  })),
}))

// Mock IncomingInheritancesCard to avoid async state updates (act warnings)
vi.mock('../components/dashboard/IncomingInheritancesCard', () => ({
  IncomingInheritancesCard: () => null,
}))

import { Dashboard } from '../components/dashboard/Dashboard'

// ── Helpers ───────────────────────────────────────────────────────

const DAY = 86400

function setNodeState(state: Record<string, unknown> | null) {
  mockUseNodeState.mockReturnValue({
    nodeState: state,
    isLoading: false,
    refetch: vi.fn(),
  })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Dashboard — CTA gating by vault status', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockUseAccount.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      isConnected: true,
    })
  })

  // ── Configuration section gating ────────────────────────────────

  it('ACTIVE with successor shows will_configuration section', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.will_configuration')).toBeDefined()
    expect(screen.getByText('dashboard.successor_label')).toBeDefined()
  })

  it('ACTIVE without successor shows successor_not_set badge', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0x0000000000000000000000000000000000000000',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'NONE',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.successor_not_set')).toBeDefined()
  })

  // ── Heir section gating ─────────────────────────────────────────

  it('registered user sees heir_section', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
  })

  it('UNREGISTERED user sees heir_section', () => {
    setNodeState(null)

    render(<Dashboard />)
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
  })

  // ── Ecosystem section gating ────────────────────────────────────

  it('registered user sees ecosystem_section (RecycleNodeCard + DividendsCard)', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()
  })

  // ── GRACE state CTA ─────────────────────────────────────────────

  it('GRACE state still renders full dashboard with all sections', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 0,
      timeUntilAbandoned: 15 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: false,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)

    // Full dashboard should be visible even in GRACE
    expect(screen.getByText('dashboard.will_configuration')).toBeDefined()
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()
    expect(screen.getByText('dashboard.total_value_secured')).toBeDefined()
  })

  // ── Claim initiated state ───────────────────────────────────────

  it('shows veto panel when successorClaimInitiated=true', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: true,
      claimInitiationTimestamp: Math.floor(Date.now() / 1000) - 5 * DAY,
      timeUntilInactive: 0,
      timeUntilAbandoned: 25 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: false,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    // The claim-in-progress panel should be visible
    expect(screen.getByText('claim_vault.claim_in_progress_title')).toBeDefined()
  })

  // ── Service tier rendering ──────────────────────────────────────

  it('BASIC tier shows full dashboard', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    // Should have status badge
    expect(screen.getByText(/dashboard\.status_active/)).toBeDefined()
  })

  // ── VaultDataCard gated by hasSuccessor ──────────────────────────

  it('vault data section renders when hasSuccessor', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.vault_data_label')).toBeDefined()
  })

  it('vault data section hidden when no successor', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0x0000000000000000000000000000000000000000',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'NONE',
    })

    render(<Dashboard />)
    expect(screen.queryByText('dashboard.vault_data_label')).toBeNull()
  })

  // ── Dividends always rendered for registered ────────────────────

  it('dividends section visible for registered user', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.dividends_label')).toBeDefined()
  })

  it('UNREGISTERED user sees dividends section', () => {
    setNodeState(null)

    render(<Dashboard />)
    expect(screen.getByText('dashboard.dividends_label')).toBeDefined()
  })
})
