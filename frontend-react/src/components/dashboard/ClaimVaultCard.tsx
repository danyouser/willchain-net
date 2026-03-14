import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI, CLAIM_PERIOD_SECONDS } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface ClaimVaultCardProps {
  /** nodeState of the current connected user (to detect incoming claims against their vault) */
  mySuccessorClaimInitiated: boolean
  myClaimInitiationTimestamp: number
  onSuccess?: () => void
}

export function ClaimVaultCard({
  mySuccessorClaimInitiated,
  myClaimInitiationTimestamp,
  onSuccess,
}: ClaimVaultCardProps) {
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000)

  // --- Simulation: cancelSuccessorClaim (owner vetoes a claim against their vault) ---
  const {
    write: writeCancel,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
    isSuccess: isCancelSuccess,
    reset: resetCancel,
    simulationError: cancelSimError,
    canWrite: canWriteCancel,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'cancelSuccessorClaim',
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && mySuccessorClaimInitiated,
  })

  useEffect(() => {
    if (isCancelSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.claim_cancelled_title'),
        message: t('notifications.claim_cancelled_msg'),
      })
      resetCancel()
      onSuccess?.()
    }
  }, [isCancelSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only render when someone has initiated a claim against MY vault
  if (!mySuccessorClaimInitiated) return null

  const vetoEndsAt = myClaimInitiationTimestamp + CLAIM_PERIOD_SECONDS
  const vetoExpired = now > vetoEndsAt
  const daysLeft = Math.max(0, Math.ceil((vetoEndsAt - now) / 86400))
  const claimDate = new Date(myClaimInitiationTimestamp * 1000).toLocaleDateString()
  const vetoDate = new Date(vetoEndsAt * 1000).toLocaleDateString()

  return (
    <div className="card" style={{ border: '1px solid var(--danger)' }}>
      <h3>{t('claim_vault.claim_in_progress_title')}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('claim_vault.claim_in_progress_hint')}
      </p>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <div>{t('claim_vault.claim_started')} <strong style={{ color: 'var(--text-primary)' }}>{claimDate}</strong></div>
        {!vetoExpired ? (
          <div>
            {t('claim_vault.veto_closes')}{' '}
            <strong style={{ color: 'var(--warning)' }}>
              {vetoDate} ({t('claim_vault.veto_days_left', { days: daysLeft })})
            </strong>
          </div>
        ) : (
          <div style={{ color: 'var(--danger)' }}>
            {t('claim_vault.veto_expired_msg')}
          </div>
        )}
      </div>
      {!vetoExpired && (
        <>
          {cancelSimError && (
            <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              ⚠ {cancelSimError}
            </p>
          )}
          <button
            className="btn btn-full"
            style={{ background: 'var(--danger)', color: '#fff', borderRadius: '12px' }}
            onClick={() => {
              if (!assertCorrectChain()) return
              writeCancel()
            }}
            disabled={isCancelPending || isCancelConfirming || !canWriteCancel}
          >
            {isCancelPending
              ? t('claim_vault.confirm_wallet')
              : isCancelConfirming
              ? t('claim_vault.cancelling')
              : t('claim_vault.im_alive_cancel')}
          </button>
        </>
      )}
    </div>
  )
}
