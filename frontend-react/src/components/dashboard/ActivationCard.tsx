import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface ActivationCardProps {
  onSuccess?: () => void
}

export function ActivationCard({ onSuccess }: ActivationCardProps) {
  const { t } = useTranslation()
  const { address } = useAccount()
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()

  const [successorInput, setSuccessorInput] = useState('')

  const trimmed = successorInput.trim()
  const validAddress = isAddress(trimmed)
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const isZeroAddress = trimmed === ZERO_ADDRESS
  const isSelf = validAddress && address && trimmed.toLowerCase() === address.toLowerCase()
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
    args: validAddress ? [trimmed as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && validAddress && !addressError,
  })

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('dashboard.activate_success_title'),
        message: t('dashboard.activate_success_msg'),
      })
      reset()
      onSuccess?.()
    }
  }, [isSuccess, onSuccess, reset, showNotification, t])

  const handleActivate = () => {
    if (!assertCorrectChain()) return
    if (!address) return
    if (!validAddress) {
      showNotification({ type: 'error', title: t('notifications.invalid_address_title'), message: t('notifications.invalid_address_msg') })
      return
    }
    write()
  }

  return (
    <div className="card card-span-2 activation-card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {t('dashboard.activate_title')}
        </span>
      </div>
      <div className="card-body">
        <p className="card-hint">{t('dashboard.activate_subtitle')}</p>

        <span className="activation-field-label">{t('dashboard.activate_successor_label')}</span>
        <input
          className={`input activation-input${addressError || (validAddress && simulationError) ? ' input-error' : ''}`}
          type="text"
          placeholder={t('dashboard.activate_successor_placeholder')}
          value={successorInput}
          onChange={e => setSuccessorInput(e.target.value)}
          disabled={isPending || isConfirming || !isCorrectChain}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('dashboard.activate_successor_label')}
          aria-invalid={!!addressError}
        />
        {validAddress && addressError && (
          <p role="alert" style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: '4px' }}>{addressError}</p>
        )}
        {validAddress && !addressError && simulationError && (
          <p role="alert" style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: '4px' }}>{simulationError}</p>
        )}

        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: '20px' }}
          onClick={handleActivate}
          disabled={isPending || isConfirming || !successorInput || (validAddress && !canWrite)}
        >
          {isPending || isConfirming
            ? t('dashboard.activate_confirming')
            : t('dashboard.activate_btn')}
        </button>
      </div>
    </div>
  )
}
