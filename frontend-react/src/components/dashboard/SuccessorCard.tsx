import { useState, useEffect } from 'react'
import { isAddress } from 'viem'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'
import { Timeline } from './Timeline'

interface TimelineData {
  lastActivity: number
  inactivityPeriod: number
  timeUntilInactive: number
  timeUntilAbandoned: number
}

interface SuccessorCardProps {
  currentSuccessor: string
  onSuccess?: () => void
  variant?: 'default' | 'hero'
  timeline?: TimelineData
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function SuccessorCard({ currentSuccessor, onSuccess, variant = 'default', timeline }: SuccessorCardProps) {
  const [newSuccessor, setNewSuccessor] = useState('')
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  const validAddress = isAddress(newSuccessor)
  const isZeroAddress = newSuccessor === ZERO_ADDRESS
  const isSelf = validAddress && address && newSuccessor.toLowerCase() === address.toLowerCase()
  const addressError = isZeroAddress
    ? t('notifications.zero_address_error')
    : isSelf
    ? t('notifications.self_address_error')
    : null

  const {
    write,
    isPending,
    isConfirming,
    isSuccess,
    reset,
    simulationError,
    canWrite,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'designateSuccessor',
    args: validAddress ? [newSuccessor as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && validAddress && !addressError,
  })

  const handleDesignate = () => {
    if (!assertCorrectChain()) return
    if (!newSuccessor) {
      showNotification({ type: 'warning', title: t('notifications.missing_address_title'), message: t('notifications.missing_address_msg') })
      return
    }
    if (!validAddress) {
      showNotification({ type: 'error', title: t('notifications.invalid_address_title'), message: t('notifications.invalid_address_msg') })
      return
    }
    write()
  }

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.successor_success_title'),
        message: `${newSuccessor.slice(0, 6)}...${newSuccessor.slice(-4)} ${t('notifications.successor_success_msg')}`,
        tip: t('notifications.successor_tip'),
      })
      reset()
      onSuccess?.()
      setTimeout(() => setNewSuccessor(''), 0)
    }
  }, [isSuccess, newSuccessor, onSuccess, reset, showNotification, t])

  const hasSuccessor = currentSuccessor && currentSuccessor !== ZERO_ADDRESS
  const isHero = variant === 'hero'

  return (
    <div className={isHero ? 'successor-card-hero' : 'card'}>
      {isHero
        ? <h3 className="dashboard-focus-label" style={{ fontSize: '0.76rem', marginBottom: '8px' }}>{t('dashboard.successor_label')}</h3>
        : <div className="card-header">
            <span className="card-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {t('dashboard.successor_label')}
            </span>
            {!hasSuccessor && (
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--amber)',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '6px',
                padding: '3px 10px',
                marginLeft: '8px',
              }}>{t('dashboard.successor_not_set')}</span>
            )}
          </div>
      }
      <div className={isHero ? '' : 'card-body'}>
      {!isHero && hasSuccessor && (
        <div className="card-value" style={{ fontSize: '1rem', wordBreak: 'break-all' }}>
          {`${currentSuccessor.slice(0, 10)}...${currentSuccessor.slice(-8)}`}
        </div>
      )}
      <input
        type="text"
        className="input"
        style={{ width: '100%', boxSizing: 'border-box' }}
        placeholder={t('dashboard.successor_placeholder')}
        value={newSuccessor}
        onChange={(e) => setNewSuccessor(e.target.value)}
        aria-label={t('dashboard.successor_placeholder')}
        aria-invalid={!!addressError}
        spellCheck={false}
        autoComplete="off"
      />
      <button
        className="btn btn-primary btn-full"
        onClick={handleDesignate}
        disabled={isPending || isConfirming || !!addressError || (validAddress && !canWrite)}
      >
        {isPending || isConfirming
          ? '...'
          : hasSuccessor
          ? t('dashboard.successor_change_btn')
          : t('dashboard.successor_btn')}
      </button>
      
      {validAddress && addressError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: 0 }}>
          ⚠ {addressError}
        </p>
      )}
      {validAddress && !addressError && simulationError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: 0 }}>
          ⚠ {simulationError}
        </p>
      )}
      
      {isHero && hasSuccessor && (
        <p style={{ fontSize: '0.75rem', color: 'var(--t3)', marginTop: '8px' }}>
          {t('successor.current')}: <code style={{ color: 'var(--t2)' }}>{currentSuccessor.slice(0, 6)}...{currentSuccessor.slice(-4)}</code>
        </p>
      )}
      {timeline && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <Timeline {...timeline} embedded />
        </div>
      )}
      </div>
    </div>

  )
}
