import { useEffect } from 'react'
import { useReadContract, useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface DividendsCardProps {
  onSuccess?: () => void
}

export function DividendsCard({ onSuccess }: DividendsCardProps) {
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  const { data: pendingRaw, refetch: refetchPending } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'pendingDividends',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const pending = pendingRaw ?? 0n
  const hasDividends = pending > 0n

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
    functionName: 'claimDividends',
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && hasDividends,
  })

  const handleClaim = () => {
    if (!assertCorrectChain()) return
    write()
  }

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.dividends_title'),
        message: t('notifications.dividends_msg'),
      })
      reset()
      refetchPending()
      onSuccess?.()
    }
  }, [isSuccess, pending, onSuccess, reset, refetchPending, showNotification]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {t('dashboard.dividends_label')}
        </span>
      </div>
      <div className="card-body">
      <div className="card-value" style={{ fontSize: '1rem' }}>
        {Number(formatEther(pending)).toFixed(4)} WILL
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {t('dashboard.dividends_hint')}
      </p>
      {hasDividends && (
        <>
          {simulationError && (
            <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              ⚠ {simulationError}
            </p>
          )}
          <button
            className="btn btn-primary btn-full"
            onClick={handleClaim}
            disabled={isPending || isConfirming || !canWrite}
          >
            {isPending
              ? t('claim_vault.confirm_wallet')
              : isConfirming
              ? t('dashboard.checkin_confirming')
              : t('dashboard.dividends_claim_btn')}
          </button>
        </>
      )}
      </div>
    </div>
  )
}
