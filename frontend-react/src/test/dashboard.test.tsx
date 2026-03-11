/**
 * UI integration tests for Dashboard status gating and onboarding flow.
 *
 * These tests verify that the Dashboard component renders the correct
 * UI elements based on vault status (UNREGISTERED, ACTIVE with/without
 * successor, GRACE, ABANDONED).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────

// Mock wagmi config (must come before wagmi — prevents getDefaultConfig from executing)
vi.mock('../config/wagmi', () => ({
  config: {},
  CHAIN_ID: 84532,
  CONTRACT_ADDRESS: '0x6fAd1475B41731E3eDA21998417Cb2e18E795877',
}))

// Mock contract config
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

// Mock wagmi — include all hooks used by Dashboard and its children
const mockUseAccount = vi.fn((): { address: `0x${string}` | undefined; isConnected: boolean } => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
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

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// Mock useBalance hook
vi.mock('../hooks/useBalance', () => ({
  useBalance: vi.fn(() => ({
    balance: 1000000n * 10n ** 18n,
    refetch: vi.fn(),
  })),
  formatTokenAmount: (val: bigint | undefined) => val ? '1,000,000' : '0',
}))

// Mock useNodeState hook — will be overridden per test
const mockUseNodeState = vi.fn()
vi.mock('../hooks/useNodeState', () => ({
  useNodeState: () => mockUseNodeState(),
}))

// Mock useIsSmartWallet
vi.mock('../hooks/useIsSmartWallet', () => ({
  useIsSmartWallet: vi.fn(() => false),
}))

// Mock useChainGuard
vi.mock('../hooks/useChainGuard', () => ({
  useChainGuard: vi.fn(() => ({
    assertCorrectChain: vi.fn(() => true),
    isCorrectChain: true,
  })),
}))

// Mock useSimulatedWrite
vi.mock('../hooks/useSimulatedWrite', () => ({
  useSimulatedWrite: vi.fn(() => ({
    write: vi.fn(),
    isPending: false,
    simulationError: null,
  })),
}))

// Mock NotificationContext
vi.mock('../context/NotificationContext', () => ({
  useNotification: vi.fn(() => ({
    showNotification: vi.fn(),
  })),
}))

// Mock useNetworkStats (used by IncomingInheritancesCard indirectly)
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

function setNodeState(state: {
  lastActivityTimestamp?: number
  designatedSuccessor?: string
  successorClaimInitiated?: boolean
  claimInitiationTimestamp?: number
  timeUntilInactive?: number
  timeUntilAbandoned?: number
  inactivityPeriod?: number
  isActive?: boolean
  serviceTier?: string
} | null) {
  mockUseNodeState.mockReturnValue({
    nodeState: state,
    isLoading: false,
    refetch: vi.fn(),
  })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Dashboard — status gating', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Restore default account mock
    mockUseAccount.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      isConnected: true,
    })
  })

  it('disconnected wallet renders nothing', () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    })
    setNodeState(null)
    const { container } = render(<Dashboard />)
    expect(container.innerHTML).toBe('')
  })

  it('loading state shows skeleton', () => {
    mockUseNodeState.mockReturnValue({
      nodeState: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })

    render(<Dashboard />)
    const skeletons = document.querySelectorAll('.dash-skeleton')
    expect(skeletons.length).toBeGreaterThanOrEqual(1)
  })

  it('UNREGISTERED (null nodeState) shows ActivationCard + all sections', () => {
    setNodeState(null)

    render(<Dashboard />)
    expect(screen.getByText('dashboard.activate_title')).toBeDefined()
    expect(screen.getByText('dashboard.balance_label')).toBeDefined()
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()
  })

  it('UNREGISTERED (lastActivityTimestamp=0) shows ActivationCard + all sections', () => {
    setNodeState({
      lastActivityTimestamp: 0,
      designatedSuccessor: '0x0000000000000000000000000000000000000000',
      timeUntilInactive: 0,
      timeUntilAbandoned: 0,
      inactivityPeriod: 90 * DAY,
    })

    render(<Dashboard />)
    expect(screen.getByText('dashboard.activate_title')).toBeDefined()
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
  })

  it('ACTIVE with successor shows full dashboard + sidebar', () => {
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

    // Full dashboard visible
    expect(screen.getByText('dashboard.total_value_secured')).toBeDefined()
    expect(screen.getByText('dashboard.will_configuration')).toBeDefined()
    expect(screen.getByText('dashboard.heir_section')).toBeDefined()
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()

    // Status badge shows active key
    expect(screen.getByText(/dashboard\.status_active/)).toBeDefined()
  })

  it('ACTIVE without successor shows dashboard but no sidebar/TimeCard', () => {
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

    // Dashboard renders but shows "balance_label" instead of "total_value_secured"
    expect(screen.getByText('dashboard.balance_label')).toBeDefined()

    // TimeCard/sidebar are gated by hasSuccessor
    expect(screen.queryByText('dashboard.total_value_secured')).toBeNull()

    // Ecosystem section still visible
    expect(screen.getByText('dashboard.ecosystem_section')).toBeDefined()
  })

  it('GRACE status shows danger badge', () => {
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

    expect(screen.getByText(/dashboard\.status_grace/)).toBeDefined()
    const badge = screen.getByText(/dashboard\.status_grace/).closest('.status-badge')
    expect(badge?.className).toContain('status-danger')
  })

  it('ABANDONED status shows danger badge', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 0,
      timeUntilAbandoned: 0,
      inactivityPeriod: 90 * DAY,
      isActive: false,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)

    expect(screen.getByText(/dashboard\.status_abandoned/)).toBeDefined()
    const badge = screen.getByText(/dashboard\.status_abandoned/).closest('.status-badge')
    expect(badge?.className).toContain('status-danger')
  })

  it('WARNING status (<7 days) shows warning badge', () => {
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      successorClaimInitiated: false,
      claimInitiationTimestamp: 0,
      timeUntilInactive: 3 * DAY,
      timeUntilAbandoned: 63 * DAY,
      inactivityPeriod: 90 * DAY,
      isActive: true,
      serviceTier: 'BASIC',
    })

    render(<Dashboard />)

    expect(screen.getByText(/dashboard\.status_warning/)).toBeDefined()
    const badge = screen.getByText(/dashboard\.status_warning/).closest('.status-badge')
    expect(badge?.className).toContain('status-warning')
  })

  it('allowance warning banner only shows when hasSuccessor=true', () => {
    // Without successor — banner hidden
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0x0000000000000000000000000000000000000000',
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
    })

    const { unmount } = render(<Dashboard />)
    expect(screen.queryByText('security.allowance_title')).toBeNull()
    unmount()

    // With successor — banner visible
    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
    })

    render(<Dashboard />)
    expect(screen.getByText('security.allowance_title')).toBeDefined()
  })

  it('allowance warning dismissed via localStorage persists', () => {
    localStorage.setItem('allowance-warning-dismissed', '1')

    setNodeState({
      lastActivityTimestamp: 1700000000,
      designatedSuccessor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      timeUntilInactive: 60 * DAY,
      timeUntilAbandoned: 120 * DAY,
      inactivityPeriod: 90 * DAY,
    })

    render(<Dashboard />)
    expect(screen.queryByText('security.allowance_title')).toBeNull()
  })
})
