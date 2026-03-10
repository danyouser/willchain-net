import { useEffect, useState, useCallback, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { isAddress, keccak256, encodePacked, toHex } from 'viem'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI, GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS, COMMIT_REVEAL_WINDOW } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useNodeState } from '../../hooks/useNodeState'
import { formatTokenAmount } from '../../hooks/useBalance'
import { useBalance } from '../../hooks/useBalance'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface RecycleNodeCardProps {
  onSuccess?: () => void
}

export function RecycleNodeCard({ onSuccess }: RecycleNodeCardProps) {
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()
  const publicClient = usePublicClient()
  const [targetAddress, setTargetAddress] = useState('')
  const [confirmPending, setConfirmPending] = useState(false)
  const blockPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Commit-reveal state — restore from sessionStorage on mount
  const [commitPhase, setCommitPhase] = useState<'idle' | 'committing' | 'waiting' | 'revealing'>(() => {
    const saved = sessionStorage.getItem('recycle-commit-phase')
    return (saved as 'idle' | 'committing' | 'waiting' | 'revealing') || 'idle'
  })
  const [pendingSalt, setPendingSalt] = useState<`0x${string}` | null>(() => {
    return (sessionStorage.getItem('recycle-salt') as `0x${string}`) || null
  })
  const [commitBlock, setCommitBlock] = useState<number>(() => {
    return parseInt(sessionStorage.getItem('recycle-commit-block') || '0')
  })

  const validTarget = isAddress(targetAddress)

  const { nodeState: targetState, isLoading: isTargetLoading } = useNodeState(
    validTarget ? (targetAddress as `0x${string}`) : undefined
  )

  const { balance: targetBalance } = useBalance(
    validTarget ? (targetAddress as `0x${string}`) : undefined
  )

  const now = Math.floor(Date.now() / 1000)

  const isAbandoned =
    validTarget &&
    targetState &&
    targetState.lastActivityTimestamp > 0 &&
    now > targetState.lastActivityTimestamp + targetState.inactivityPeriod + GRACE_PERIOD_SECONDS + CLAIM_PERIOD_SECONDS

  // Compute abandonedAt — two paths mirror contract _isFreshAbandoned()
  const abandonedAt =
    targetState && targetState.lastActivityTimestamp > 0
      ? targetState.successorClaimInitiated && targetState.claimInitiationTimestamp > 0
        ? targetState.claimInitiationTimestamp + GRACE_PERIOD_SECONDS + CLAIM_PERIOD_SECONDS
        : targetState.lastActivityTimestamp + targetState.inactivityPeriod + GRACE_PERIOD_SECONDS + CLAIM_PERIOD_SECONDS
      : 0

  const isFreshAbandoned = isAbandoned && now <= abandonedAt + COMMIT_REVEAL_WINDOW

  // Generate commit hash
  const generateSalt = useCallback((): `0x${string}` => {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return toHex(bytes)
  }, [])

  const computeCommitHash = useCallback((target: string, salt: `0x${string}`, committer: string) => {
    return keccak256(encodePacked(
      ['address', 'bytes32', 'address'],
      [target as `0x${string}`, salt, committer as `0x${string}`]
    ))
  }, [])

  // Direct recycle (for stale ABANDONED)
  const {
    write: writeRecycle,
    isPending: isRecyclePending,
    isConfirming: isRecycleConfirming,
    isSuccess: isRecycleSuccess,
    reset: resetRecycle,
    simulationError: recycleSimError,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'recycleInactiveNode',
    args: validTarget ? [targetAddress as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && validTarget && !!isAbandoned && !isFreshAbandoned && targetBalance > 0n,
  })

  // Commit tx
  const commitHash = pendingSalt && address && validTarget
    ? computeCommitHash(targetAddress, pendingSalt, address)
    : undefined

  const {
    write: writeCommit,
    isPending: isCommitPending,
    isConfirming: isCommitConfirming,
    isSuccess: isCommitSuccess,
    reset: resetCommit,
    simulationError: commitSimError,
    canWrite: canCommit,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'commitRecycle',
    args: commitHash ? [commitHash] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && !!commitHash && commitPhase === 'committing',
  })

  // Execute tx
  const {
    write: writeExecute,
    isPending: isExecutePending,
    isConfirming: isExecuteConfirming,
    isSuccess: isExecuteSuccess,
    reset: resetExecute,
    simulationError: executeSimError,
    canWrite: canExecute,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'executeRecycle',
    args: validTarget && pendingSalt ? [targetAddress as `0x${string}`, pendingSalt] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && validTarget && !!pendingSalt && commitPhase === 'revealing',
  })

  // Handle direct recycle success
  useEffect(() => {
    if (isRecycleSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.recycled_title'),
        message: t('notifications.recycled_msg'),
      })
      resetRecycle()
      setTargetAddress('')
      setConfirmPending(false)
      onSuccess?.()
    }
  }, [isRecycleSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist commit state to sessionStorage
  useEffect(() => {
    if (commitPhase !== 'idle' && pendingSalt) {
      sessionStorage.setItem('recycle-commit-phase', commitPhase)
      sessionStorage.setItem('recycle-salt', pendingSalt)
      if (commitBlock > 0) sessionStorage.setItem('recycle-commit-block', String(commitBlock))
    } else if (commitPhase === 'idle') {
      sessionStorage.removeItem('recycle-commit-phase')
      sessionStorage.removeItem('recycle-salt')
      sessionStorage.removeItem('recycle-commit-block')
    }
  }, [commitPhase, pendingSalt, commitBlock])

  // Handle commit success → save commit block, start block polling
  useEffect(() => {
    if (isCommitSuccess && publicClient) {
      resetCommit()
      setCommitPhase('waiting')
      publicClient.getBlockNumber().then(bn => {
        setCommitBlock(Number(bn))
      })
    }
  }, [isCommitSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Block-based polling: check if 2+ blocks have passed since commit
  useEffect(() => {
    if (commitPhase === 'waiting' && commitBlock > 0 && publicClient) {
      const poll = async () => {
        try {
          const currentBlock = Number(await publicClient.getBlockNumber())
          if (currentBlock >= commitBlock + 2) {
            setCommitPhase('revealing')
            if (blockPollRef.current) clearInterval(blockPollRef.current)
          }
        } catch { /* RPC error — retry next interval */ }
      }
      poll() // check immediately
      blockPollRef.current = setInterval(poll, 3000)
      return () => { if (blockPollRef.current) clearInterval(blockPollRef.current) }
    }
  }, [commitPhase, commitBlock, publicClient])

  // Handle execute success
  useEffect(() => {
    if (isExecuteSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.recycled_title'),
        message: t('notifications.recycled_msg'),
      })
      resetExecute()
      setTargetAddress('')
      setConfirmPending(false)
      setCommitPhase('idle')
      setPendingSalt(null)
      setCommitBlock(0)
      onSuccess?.()
    }
  }, [isExecuteSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-execute after waiting phase
  useEffect(() => {
    if (commitPhase === 'revealing' && canExecute) {
      writeExecute()
    }
  }, [commitPhase, canExecute]) // eslint-disable-line react-hooks/exhaustive-deps

  const maintainerReward = isAbandoned && targetBalance > 0n
    ? (targetBalance * 100n) / 10000n
    : 0n

  const isPastInactivityPeriod =
    validTarget &&
    targetState &&
    targetState.lastActivityTimestamp > 0 &&
    now > targetState.lastActivityTimestamp + targetState.inactivityPeriod

  const statusInfo = () => {
    if (!validTarget || !targetState) return null
    if (targetState.lastActivityTimestamp === 0) return { text: t('recycle.status_never_registered'), color: 'var(--text-secondary)' }
    if (isAbandoned && targetBalance === 0n) return { text: t('recycle.status_already_recycled'), color: 'var(--text-secondary)' }
    if (isAbandoned) return { text: t('recycle.status_abandoned'), color: 'var(--danger)' }
    if (targetState.successorClaimInitiated) return { text: t('recycle.status_claim_in_progress'), color: 'var(--warning)' }
    if (isPastInactivityPeriod) return { text: t('recycle.status_inactive'), color: 'var(--warning)' }
    return { text: t('recycle.status_active'), color: 'var(--success)' }
  }

  const status = statusInfo()

  const isPending = isRecyclePending || isCommitPending || isExecutePending
  const isConfirming = isRecycleConfirming || isCommitConfirming || isExecuteConfirming
  const simulationError = isFreshAbandoned
    ? (commitSimError || executeSimError)
    : recycleSimError

  const handleRecycle = () => {
    if (!assertCorrectChain()) return
    if (isFreshAbandoned) {
      // Start commit-reveal flow
      const salt = generateSalt()
      setPendingSalt(salt)
      setCommitPhase('committing')
    } else {
      writeRecycle()
    }
  }

  // Trigger commit write when phase and hash are ready
  useEffect(() => {
    if (commitPhase === 'committing' && canCommit) {
      writeCommit()
    }
  }, [commitPhase, canCommit]) // eslint-disable-line react-hooks/exhaustive-deps

  const getButtonLabel = () => {
    if (commitPhase === 'committing' && (isCommitPending || isCommitConfirming)) return t('recycle.commit_confirming')
    if (commitPhase === 'waiting') return t('recycle.commit_waiting')
    if (commitPhase === 'revealing' && (isExecutePending || isExecuteConfirming)) return t('recycle.execute_confirming')
    if (isPending) return t('recycle.confirm_wallet')
    if (isConfirming) return t('recycle.recycling')
    return t('recycle.confirm_yes')
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
          {t('recycle.label')}
        </span>
      </div>
      <div className="card-body">
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('recycle.hint')}
      </p>

      <div className="form-group">
        <label>{t('recycle.owner_label')}</label>
        <input
          type="text"
          className="input"
          placeholder={t('recycle.placeholder')}
          value={targetAddress}
          onChange={e => setTargetAddress(e.target.value)}
          aria-label={t('recycle.owner_label')}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {validTarget && isTargetLoading && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('recycle.loading')}</p>
      )}

      {status && (
        <p style={{ fontSize: '0.85rem', color: status.color }}>
          {status.text}
        </p>
      )}

      {isAbandoned && targetBalance > 0n && (
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            padding: '10px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
          }}
        >
          <div>
            {t('recycle.vault_balance')}{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatTokenAmount(targetBalance)} WILL
            </strong>
          </div>
          <div>
            {t('recycle.your_reward')}{' '}
            <strong style={{ color: 'var(--accent-secondary)' }}>
              {formatTokenAmount(maintainerReward)} WILL
            </strong>
          </div>
          {isFreshAbandoned && (
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              {t('recycle.fresh_hint')}
            </div>
          )}
        </div>
      )}

      {simulationError && isAbandoned && targetBalance > 0n && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
          {simulationError}
        </p>
      )}

      {isAbandoned && targetBalance > 0n && !confirmPending && commitPhase === 'idle' && (
        <button
          className="btn btn-primary btn-full"
          onClick={() => setConfirmPending(true)}
          disabled={isPending || isConfirming}
        >
          {t('recycle.recycle_btn')}
        </button>
      )}

      {isAbandoned && targetBalance > 0n && confirmPending && commitPhase === 'idle' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-danger"
            style={{ flex: 1 }}
            onClick={handleRecycle}
            disabled={isPending || isConfirming}
          >
            {t('recycle.confirm_yes')}
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => setConfirmPending(false)}
          >
            {t('recycle.confirm_no')}
          </button>
        </div>
      )}

      {commitPhase !== 'idle' && (
        <button
          className="btn btn-danger btn-full"
          disabled={true}
        >
          {getButtonLabel()}
        </button>
      )}
      </div>
    </div>
  )
}
