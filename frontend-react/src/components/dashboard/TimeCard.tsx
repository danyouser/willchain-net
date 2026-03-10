import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface TimeCardProps {
  timeUntilInactive: number
  inactivityPeriod: number
  onSuccess?: () => void
}

export function TimeCard({ timeUntilInactive, inactivityPeriod, onSuccess }: TimeCardProps) {
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  const { write, isPending, isConfirming, isSuccess, reset, simulationError, canWrite } =
    useSimulatedWrite({
      address: CONTRACT_ADDRESS,
      abi: WILLCHAIN_ABI,
      functionName: 'confirmActivity',
      chainId: CHAIN_ID,
      enabled: isCorrectChain && !!address,
    })

  const formatDays = (seconds: number) => Math.floor(seconds / 86400)
  const daysRemaining = formatDays(timeUntilInactive)
  const totalDays = formatDays(inactivityPeriod)
  const percentage = totalDays > 0 ? Math.min(1, Math.max(0, daysRemaining / totalDays)) : 0

  // Heartbeat state: calm → warning → critical
  const isCritical = percentage < 0.15
  const isWarning = percentage < 0.35 && !isCritical

  // Ring color and pulse speed
  const ringColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#3b82f6'
  const ringColor2 = isCritical ? '#b91c1c' : isWarning ? '#d97706' : '#7c3aed'
  const pulseClass = isCritical ? 'heartbeat-critical' : isWarning ? 'heartbeat-warning' : 'heartbeat-calm'
  const glowColor = isCritical
    ? 'rgba(239,68,68,0.35)'
    : isWarning
    ? 'rgba(245,158,11,0.25)'
    : 'rgba(59,130,246,0.2)'

  const handleCheckIn = () => {
    if (!assertCorrectChain()) return
    write()
  }

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.checkin_success_title'),
        message: t('notifications.checkin_success_msg'),
        tip: t('dashboard.checkin_hint'),
      })
      reset()
      onSuccess?.()
    }
  }, [isSuccess, inactivityPeriod, onSuccess, reset, showNotification, t])

  return (
    <div className="card time-card">
      <h3 className="heartbeat-title">{t('dashboard.heartbeat_title')}</h3>
      
      {/* Heartbeat ring */}
      <div className={`heartbeat-wrap ${pulseClass}`} style={{ '--glow': glowColor } as React.CSSProperties}>
        <svg className="heartbeat-svg" viewBox="0 0 240 240" width="220" height="220">
          <defs>
            <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={ringColor} />
              <stop offset="100%" stopColor={ringColor2} />
            </linearGradient>
            <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
               <feGaussianBlur stdDeviation="8" result="blur" />
               <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* Background glow circle */}
          <circle cx="120" cy="120" r="90" fill="rgba(59,130,246,0.03)" filter="url(#innerGlow)" />
          
          {/* Track */}
          <circle cx="120" cy="120" r="90" fill="none"
            stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
            
          {/* Progress */}
          <circle cx="120" cy="120" r="90" fill="none"
            stroke="url(#hbg)" strokeWidth="12"
            strokeDasharray={2 * Math.PI * 90}
            strokeDashoffset={2 * Math.PI * 90 * (1 - percentage)}
            strokeLinecap="round"
            transform="rotate(-90 120 120)"
            className="heartbeat-ring"
            style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6))' }}
          />
          
          {/* Days */}
          <text x="120" y="115" textAnchor="middle"
            fill="white" fontSize="48" fontFamily="Inter,sans-serif" fontWeight="800" letterSpacing="-0.02em">
            {daysRemaining}
          </text>
          
          <text x="120" y="140" textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="14" fontFamily="Inter,sans-serif" fontWeight="500">
            {t('dashboard.timer_days')}
          </text>
          
          {/* Status Label at bottom */}
          <text x="120" y="165" textAnchor="middle"
            fill={isCritical ? 'var(--red)' : isWarning ? 'var(--amber)' : 'var(--green)'} 
            fontSize="11" fontFamily="Inter,sans-serif" fontWeight="700" letterSpacing="0.05em">
            {Math.round(percentage * 100)}% / {isCritical ? t('dashboard.heartbeat_status_critical') : isWarning ? t('dashboard.heartbeat_status_warning') : t('dashboard.heartbeat_status_active')}
          </text>
        </svg>
      </div>

      <div className="heartbeat-footer">
        <span className="heartbeat-subtitle">{t('dashboard.next_ping')}:<br /><strong>{daysRemaining} {t('dashboard.timer_days')} {Math.floor((timeUntilInactive % 86400) / 3600)} {t('dashboard.timer_hours')}</strong></span>
      </div>

      {simulationError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--red)', margin: '8px 0', textAlign: 'center' }}>
          ⚠ {simulationError}
        </p>
      )}

      <button
        className={`btn btn-full heartbeat-btn${isCritical ? ' btn-danger' : isWarning ? ' btn-warning' : ' btn-primary'}`}
        onClick={handleCheckIn}
        disabled={isPending || isConfirming || !canWrite}
        style={{ marginTop: '16px' }}
      >
        {isPending
          ? t('claim_vault.confirm_wallet')
          : isConfirming
          ? t('dashboard.checkin_confirming')
          : t('dashboard.checkin_btn')}
      </button>
    </div>
  )
}
