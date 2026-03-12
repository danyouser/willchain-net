import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI, GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useNodeState } from '../../hooks/useNodeState'
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

  // Input for successor to enter a target vault address
  const [targetAddress, setTargetAddress] = useState('')
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Fetch state of the target vault address (if valid)
  const { nodeState: targetState, isLoading: isTargetLoading } = useNodeState(
    isAddress(targetAddress) ? (targetAddress as `0x${string}`) : undefined
  )

  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000)

  const validTarget = isAddress(targetAddress)

  const targetInactive =
    validTarget &&
    targetState &&
    targetState.lastActivityTimestamp > 0 &&
    now > targetState.lastActivityTimestamp + targetState.inactivityPeriod

  const targetAbandoned =
    validTarget &&
    targetState &&
    targetState.lastActivityTimestamp > 0 &&
    now > targetState.lastActivityTimestamp + targetState.inactivityPeriod + GRACE_PERIOD_SECONDS + CLAIM_PERIOD_SECONDS

  // Only the designated successor can initiate/complete — hide buttons for everyone else
  const isDesignatedSuccessor =
    validTarget &&
    address &&
    targetState?.designatedSuccessor?.toLowerCase() === address.toLowerCase()

  // Contract rejects initiateSuccessorClaim() on ABANDONED vaults — don't show the button
  const canInitiate =
    targetInactive && !targetAbandoned && !targetState!.successorClaimInitiated && isDesignatedSuccessor

  const canComplete =
    validTarget &&
    targetState?.successorClaimInitiated &&
    targetState.claimInitiationTimestamp > 0 &&
    now > targetState.claimInitiationTimestamp + CLAIM_PERIOD_SECONDS &&
    // Still within total timeout (not yet ABANDONED)
    now <= targetState.lastActivityTimestamp + targetState.inactivityPeriod + GRACE_PERIOD_SECONDS + CLAIM_PERIOD_SECONDS &&
    isDesignatedSuccessor

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

  // --- Simulation: initiateSuccessorClaim ---
  const {
    write: writeInitiate,
    isPending: isInitiatePending,
    isConfirming: isInitiateConfirming,
    isSuccess: isInitiateSuccess,
    reset: resetInitiate,
    simulationError: initiateSimError,
    canWrite: canWriteInitiate,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'initiateSuccessorClaim',
    args: validTarget ? [targetAddress as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && !!canInitiate,
  })

  // --- Simulation: completeVaultTransfer ---
  const {
    write: writeComplete,
    isPending: isCompletePending,
    isConfirming: isCompleteConfirming,
    isSuccess: isCompleteSuccess,
    reset: resetComplete,
    simulationError: completeSimError,
    canWrite: canWriteComplete,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'completeVaultTransfer',
    args: validTarget ? [targetAddress as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && !!canComplete,
  })

  useEffect(() => {
    if (isInitiateSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.claim_initiated_title'),
        message: t('notifications.claim_initiated_msg'),
      })
      resetInitiate()
      onSuccess?.()
    }
  }, [isInitiateSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isCompleteSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.claim_completed_title'),
        message: t('notifications.claim_completed_msg'),
      })
      resetComplete()
      setConfirmComplete(false)
      onSuccess?.()
    }
  }, [isCompleteSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // -----------------------------------------------
  // Panel A: Owner — someone has initiated a claim against MY vault
  // -----------------------------------------------
  if (mySuccessorClaimInitiated) {
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

  // -----------------------------------------------
  // Panel B: Successor — enter a vault address to claim
  // -----------------------------------------------
  const daysUntilVetoEnds =
    targetState?.successorClaimInitiated && targetState.claimInitiationTimestamp > 0
      ? Math.max(0, Math.ceil((targetState.claimInitiationTimestamp + CLAIM_PERIOD_SECONDS - now) / 86400))
      : 0

  const targetStatusText = () => {
    if (!validTarget || !targetState) return null
    if (targetState.lastActivityTimestamp === 0) return { text: t('claim_vault.status_never_registered'), color: 'var(--text-secondary)' }
    if (targetState.successorClaimInitiated)
      return {
        text: t('claim_vault.status_claim_in_progress', { days: daysUntilVetoEnds }),
        color: 'var(--warning)',
      }
    if (targetAbandoned) return { text: t('claim_vault.status_abandoned'), color: 'var(--text-secondary)' }
    if (targetInactive) return { text: t('claim_vault.status_inactive'), color: 'var(--danger)' }
    return { text: t('claim_vault.status_active'), color: 'var(--success)' }
  }

  const status = targetStatusText()

  const isClaimPending = isInitiatePending || isCompletePending
  const isClaimConfirming = isInitiateConfirming || isCompleteConfirming

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          {t('claim_vault.title')}
        </span>
      </div>
      <div className="card-body">
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('claim_vault.hint')}
      </p>

      <div className="form-group">
        <label>{t('claim_vault.owner_label')}</label>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            className="input"
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: '36px' }}
            placeholder="0x..."
            value={targetAddress}
            onChange={e => setTargetAddress(e.target.value)}
            aria-label={t('claim_vault.owner_label')}
            spellCheck={false}
            autoComplete="off"
          />
          {targetAddress && (
            <button
              type="button"
              onClick={() => setTargetAddress('')}
              aria-label="Clear"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', lineHeight: 1 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {validTarget && isTargetLoading && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('claim_vault.loading')}</p>
      )}

      {status && (
        <p style={{ fontSize: '0.85rem', color: status.color }}>
          {status.text}
        </p>
      )}

      {canInitiate && (
        <>
          {initiateSimError && (
            <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              ⚠ {initiateSimError}
            </p>
          )}
          <button
            className="btn btn-primary btn-full"
            onClick={() => {
              if (!assertCorrectChain()) return
              writeInitiate()
            }}
            disabled={isClaimPending || isClaimConfirming || !canWriteInitiate}
          >
            {isInitiatePending ? t('claim_vault.confirm_wallet') : isInitiateConfirming ? t('claim_vault.initiating') : t('claim_vault.initiate_btn')}
          </button>
        </>
      )}

      {canComplete && !confirmComplete && (
        <>
          {completeSimError && (
            <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              ⚠ {completeSimError}
            </p>
          )}
          <button
            className="btn btn-primary btn-full"
            onClick={() => setConfirmComplete(true)}
            disabled={isClaimPending || isClaimConfirming || !canWriteComplete}
          >
            {t('claim_vault.complete_btn')}
          </button>
        </>
      )}

      {canComplete && confirmComplete && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
            ⚠ {t('claim_vault.confirm_complete_warning')}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={() => {
                if (!assertCorrectChain()) return
                writeComplete()
              }}
              disabled={isClaimPending || isClaimConfirming || !canWriteComplete}
            >
              {isCompletePending ? t('claim_vault.confirm_wallet') : isCompleteConfirming ? t('claim_vault.completing') : t('claim_vault.confirm_yes')}
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setConfirmComplete(false)}
            >
              {t('claim_vault.confirm_no')}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  )
}
