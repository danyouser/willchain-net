/**
 * Integration tests for SuccessorCard component.
 *
 * Tests: inline validation (zero address, self-address, circular),
 * simulation error display, button state management, and success flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('../config/wagmi', () => ({
  config: {},
  CHAIN_ID: 84532,
  CONTRACT_ADDRESS: '0x6fAd1475B41731E3eDA21998417Cb2e18E795877',
}))

vi.mock('../config/contract', () => ({
  CONTRACT_ADDRESS: '0x6fAd1475B41731E3eDA21998417Cb2e18E795877',
  WILLCHAIN_ABI: [],
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
  useChainId: vi.fn(() => 84532),
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

vi.mock('../context/NotificationContext', () => ({
  useNotification: vi.fn(() => ({
    showNotification: vi.fn(),
  })),
}))

vi.mock('../hooks/useChainGuard', () => ({
  useChainGuard: vi.fn(() => ({
    assertCorrectChain: vi.fn(() => true),
    isCorrectChain: true,
  })),
}))

const mockWrite = vi.fn()
const mockSimulatedWrite = vi.fn(() => ({
  write: mockWrite,
  isPending: false,
  isConfirming: false,
  isSuccess: false,
  reset: vi.fn(),
  simulationError: null as string | null,
  canWrite: true,
}))

vi.mock('../hooks/useSimulatedWrite', () => ({
  useSimulatedWrite: () => mockSimulatedWrite(),
}))

import { SuccessorCard } from '../components/dashboard/SuccessorCard'

// ── Helpers ───────────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const VALID_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SELF_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

// ── Tests ─────────────────────────────────────────────────────────

describe('SuccessorCard — validation and UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAccount.mockReturnValue({
      address: SELF_ADDRESS as `0x${string}`,
      isConnected: true,
    })
    mockSimulatedWrite.mockReturnValue({
      write: mockWrite,
      isPending: false,
      isConfirming: false,
      isSuccess: false,
      reset: vi.fn(),
      simulationError: null,
      canWrite: true,
    })
  })

  it('renders with "Set" button when no successor', () => {
    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    expect(screen.getByText('dashboard.successor_btn')).toBeDefined()
    expect(screen.getByText('dashboard.successor_not_set')).toBeDefined()
  })

  it('renders with "Change" button when successor exists', () => {
    render(<SuccessorCard currentSuccessor={VALID_ADDRESS} />)
    expect(screen.getByText('dashboard.successor_change_btn')).toBeDefined()
  })

  it('shows zero address error inline', () => {
    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    fireEvent.change(input, { target: { value: ZERO_ADDRESS } })

    // Error alert should appear
    const alerts = document.querySelectorAll('[role="alert"]')
    const alertTexts = Array.from(alerts).map(a => a.textContent)
    expect(alertTexts.some(t => t?.includes('notifications.zero_address_error'))).toBe(true)
  })

  it('shows self-address error inline', () => {
    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    fireEvent.change(input, { target: { value: SELF_ADDRESS } })

    const alerts = document.querySelectorAll('[role="alert"]')
    const alertTexts = Array.from(alerts).map(a => a.textContent)
    expect(alertTexts.some(t => t?.includes('notifications.self_address_error'))).toBe(true)
  })

  it('disables button when address error exists', () => {
    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    fireEvent.change(input, { target: { value: ZERO_ADDRESS } })

    const btn = screen.getByText('dashboard.successor_btn')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('shows simulation error when circular successor', () => {
    mockSimulatedWrite.mockReturnValue({
      write: mockWrite,
      isPending: false,
      isConfirming: false,
      isSuccess: false,
      reset: vi.fn(),
      simulationError: 'Circular successor chain',
      canWrite: false,
    })

    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    fireEvent.change(input, { target: { value: VALID_ADDRESS } })

    const alerts = document.querySelectorAll('[role="alert"]')
    const alertTexts = Array.from(alerts).map(a => a.textContent)
    expect(alertTexts.some(t => t?.includes('Circular successor chain'))).toBe(true)
  })

  it('disables button when simulation fails (canWrite=false)', () => {
    mockSimulatedWrite.mockReturnValue({
      write: mockWrite,
      isPending: false,
      isConfirming: false,
      isSuccess: false,
      reset: vi.fn(),
      simulationError: 'Some error',
      canWrite: false,
    })

    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    fireEvent.change(input, { target: { value: VALID_ADDRESS } })

    const btn = screen.getByText('dashboard.successor_btn')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('shows pending state ("...") when transaction in progress', () => {
    mockSimulatedWrite.mockReturnValue({
      write: mockWrite,
      isPending: true,
      isConfirming: false,
      isSuccess: false,
      reset: vi.fn(),
      simulationError: null,
      canWrite: true,
    })

    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    expect(screen.getByText('...')).toBeDefined()
  })

  it('hero variant renders without card wrapper', () => {
    const { container } = render(
      <SuccessorCard currentSuccessor={VALID_ADDRESS} variant="hero" />
    )
    expect(container.querySelector('.successor-card-hero')).toBeTruthy()
    expect(container.querySelector('.card')).toBeFalsy()
  })

  it('input has accessibility attributes', () => {
    render(<SuccessorCard currentSuccessor={ZERO_ADDRESS} />)
    const input = screen.getByPlaceholderText('dashboard.successor_placeholder')
    expect(input.getAttribute('aria-label')).toBe('dashboard.successor_placeholder')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('autocomplete')).toBe('off')
  })
})
