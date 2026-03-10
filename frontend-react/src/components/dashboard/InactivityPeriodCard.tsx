import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI, INACTIVITY_PERIODS } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface InactivityPeriodCardProps {
  currentPeriod: number
  onSuccess?: () => void
}

export function InactivityPeriodCard({ currentPeriod, onSuccess }: InactivityPeriodCardProps) {
  const [selected, setSelected] = useState<number>(currentPeriod || INACTIVITY_PERIODS.DAYS_90)
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  const PERIOD_OPTIONS = [
    { label: t('inactivity_periods.days_30'), value: INACTIVITY_PERIODS.DAYS_30 },
    { label: t('inactivity_periods.days_90'), value: INACTIVITY_PERIODS.DAYS_90 },
    { label: t('inactivity_periods.days_180'), value: INACTIVITY_PERIODS.DAYS_180 },
    { label: t('inactivity_periods.days_365'), value: INACTIVITY_PERIODS.DAYS_365 },
  ]

  const isChanged = selected !== currentPeriod

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
    functionName: 'setInactivityPeriod',
    args: [BigInt(selected)],
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && isChanged,
  })

  const handleSet = () => {
    if (!assertCorrectChain()) return
    write()
  }

  useEffect(() => {
    if (isSuccess) {
      const label = PERIOD_OPTIONS.find(p => p.value === selected)?.label ?? `${Math.floor(selected / 86400)} days`
      showNotification({
        type: 'success',
        title: t('notifications.period_success_title'),
        message: `${t('notifications.period_success_msg')} ${label}.`,
        tip: t('notifications.period_success_tip'),
      })
      reset()
      onSuccess?.()
    }
  }, [isSuccess, selected, onSuccess, reset, showNotification, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentLabel = PERIOD_OPTIONS.find(p => p.value === currentPeriod)?.label ?? `${Math.floor(currentPeriod / 86400)} days`

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {t('dashboard.inactivity_period_label')}
        </span>
      </div>
      <div className="card-body">
      <div className="card-value" style={{ fontSize: '1rem' }}>
        {currentLabel}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {t('dashboard.inactivity_period_hint')}
      </p>
      <div className="select-wrap">
        <select
          className="input activation-select"
          value={selected}
          onChange={e => setSelected(Number(e.target.value))}
        >
          {PERIOD_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {isChanged && simulationError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
          ⚠ {simulationError}
        </p>
      )}
      <button
        className="btn btn-primary btn-full"
        onClick={handleSet}
        disabled={!isChanged || isPending || isConfirming || (isChanged && !canWrite)}
      >
        {isPending
          ? t('claim_vault.confirm_wallet')
          : isConfirming
          ? t('dashboard.checkin_confirming')
          : t('dashboard.inactivity_set_btn')}
      </button>
      </div>
    </div>
  )
}
