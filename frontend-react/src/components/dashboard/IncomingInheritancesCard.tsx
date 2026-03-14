import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount, useReadContracts } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { VAULT_STATUS } from '../../utils/vaultStatus'
import { GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS } from '../../config/contract'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'
import { useNotification } from '../../context/NotificationContext'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? '/api'

type InheritanceItem = {
  addr: string
  vaultStatus: number
  designatedSuccessor: string
  lastActivityTimestamp: number
  inactivityPeriod: number
  successorClaimInitiated: boolean
  claimInitiationTimestamp: number
}

interface IncomingInheritancesCardProps {
  onSuccess?: () => void
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function IncomingInheritancesCard({ onSuccess }: IncomingInheritancesCardProps) {
  const { t } = useTranslation()
  const { address } = useAccount()

  // Live tick for countdown timers
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const [owners, setOwners] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch the list of vault owners who designated us as successor
  useEffect(() => {
    if (!address) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const run = async () => {
      try {
        setFetching(true)
        const res = await fetch(`${BOT_API_URL}/successors/${address.toLowerCase()}`, { signal: controller.signal })
        const json = res.ok ? await res.json() : { owners: [] }
        setOwners(Array.isArray(json.owners) ? json.owners : [])
      } catch {
        if (!controller.signal.aborted) setOwners([])
      } finally {
        if (!controller.signal.aborted) {
          setFetching(false)
          setFetched(true)
        }
      }
    }
    run()
    return () => { controller.abort() }
  }, [address])

  // Batch-read nodeStates for each owner (derive status client-side
  // because getVaultStatus depends on everRegistered which may not be set)
  const contracts = owners.map(addr => ({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'nodeStates' as const,
    args: [addr as `0x${string}`],
    chainId: CHAIN_ID,
  }))

  const { data: contractData, isLoading: isReadLoading } = useReadContracts({
    contracts,
    query: { enabled: owners.length > 0 },
  })

  // Derive vault status client-side from nodeStates data
  function deriveStatus(lastActivity: number, inactPeriod: number): number {
    if (lastActivity === 0) return VAULT_STATUS.UNREGISTERED
    const inactiveAt = lastActivity + inactPeriod
    if (now < inactiveAt) return VAULT_STATUS.ACTIVE
    const graceEnd = inactiveAt + GRACE_PERIOD_SECONDS
    if (now < graceEnd) return VAULT_STATUS.GRACE
    const claimEnd = graceEnd + CLAIM_PERIOD_SECONDS
    if (now < claimEnd) return VAULT_STATUS.CLAIMABLE
    return VAULT_STATUS.ABANDONED
  }

  // Build items array, filtering out entries where successor changed
  const items: InheritanceItem[] = []
  if (contractData && address) {
    for (let i = 0; i < owners.length; i++) {
      const result = contractData[i]
      if (result?.status !== 'success') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeState = result.result as any
      const designatedSuccessor: string = nodeState?.[4] ?? nodeState?.designatedSuccessor ?? ''
      if (designatedSuccessor.toLowerCase() !== address.toLowerCase()) continue
      const lastActivityTimestamp = Number(nodeState?.[0] ?? 0)
      const inactivityPeriod = Number(nodeState?.[2] ?? 0) || 90 * 24 * 60 * 60
      items.push({
        addr: owners[i],
        vaultStatus: deriveStatus(lastActivityTimestamp, inactivityPeriod),
        designatedSuccessor,
        lastActivityTimestamp,
        inactivityPeriod,
        successorClaimInitiated: !!nodeState?.[5],
        claimInitiationTimestamp: Number(nodeState?.[1] ?? 0),
      })
    }
  }

  const statusLabel: Record<number, string> = {
    [VAULT_STATUS.UNREGISTERED]: t('claim_vault.incoming_status_unregistered', 'Not activated'),
    [VAULT_STATUS.ACTIVE]:    t('claim_vault.incoming_status_active',    'Active'),
    [VAULT_STATUS.GRACE]:     t('claim_vault.incoming_status_grace',     'Grace Period'),
    [VAULT_STATUS.CLAIMABLE]: t('claim_vault.incoming_status_claimable', 'Claimable'),
    [VAULT_STATUS.ABANDONED]: t('claim_vault.incoming_status_abandoned', 'Abandoned'),
  }

  const dotClass: Record<number, string> = {
    [VAULT_STATUS.UNREGISTERED]: '',
    [VAULT_STATUS.ACTIVE]:    'active',
    [VAULT_STATUS.GRACE]:     'grace',
    [VAULT_STATUS.CLAIMABLE]: 'claimable',
    [VAULT_STATUS.ABANDONED]: 'abandoned',
  }

  const isSpinner = fetching || (owners.length > 0 && isReadLoading)

  // Don't render until API resolves
  if (!fetched) return null

  return (
    <div className={`card${items.length > 0 ? ' incoming-highlight' : ''}`}>
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="7 17 17 7"/>
            <polyline points="7 7 17 7 17 17"/>
          </svg>
          {t('dashboard.incoming_inheritances')}
          {items.length > 0 && (
            <span className="incoming-badge">{items.length}</span>
          )}
        </span>
      </div>
      <div className="card-body">
        {isSpinner && (
          <p className="card-hint">{t('claim_vault.incoming_loading', 'Loading...')}</p>
        )}

        {!isSpinner && items.length === 0 && (
          <div className="incoming-empty-state">
            <strong>{t('claim_vault.incoming_none', 'No incoming inheritances.')}</strong>
            <p className="card-hint">{
              t('claim_vault.incoming_empty_hint', 'If any vault designates you as successor, it will appear here automatically.')
            }</p>
          </div>
        )}

        {!isSpinner && items.length > 0 && (
          <div className="incoming-inheritances-list">
            <p className="card-hint" style={{ margin: '0 0 8px' }}>
              {t('claim_vault.incoming_hint')}
            </p>
            {items.map(item => {
              const isClaimable = item.vaultStatus === VAULT_STATUS.CLAIMABLE
              const badgeText = (statusLabel[item.vaultStatus] ?? '—')
              const dot = dotClass[item.vaultStatus] ?? ''
              const inactiveAt = item.lastActivityTimestamp + item.inactivityPeriod
              const graceEndAt = inactiveAt + GRACE_PERIOD_SECONDS
              const claimEndAt = graceEndAt + CLAIM_PERIOD_SECONDS

              const formatCountdown = (secs: number) => {
                if (secs <= 0) return '—'
                const d = Math.floor(secs / 86400)
                const h = Math.floor((secs % 86400) / 3600)
                const m = Math.floor((secs % 3600) / 60)
                const s = secs % 60
                return `${d}${t('dashboard.timer_d')} ${h}${t('dashboard.timer_h')} ${String(m).padStart(2, '0')}${t('dashboard.timer_m')} ${String(s).padStart(2, '0')}${t('dashboard.timer_s')}`
              }

              let timeHint = ''
              if (item.vaultStatus === VAULT_STATUS.ACTIVE && item.lastActivityTimestamp > 0) {
                const secsLeft = inactiveAt - now
                timeHint = secsLeft > 0 ? formatCountdown(secsLeft) : ''
              } else if (item.vaultStatus === VAULT_STATUS.GRACE) {
                const secsLeft = graceEndAt - now
                timeHint = secsLeft > 0 ? formatCountdown(secsLeft) : ''
              }

              return (
                <div
                  key={item.addr}
                  className={`inheritance-item${isClaimable ? ' claimable' : ''}`}
                >
                  <div className={`inheritance-status-dot${dot ? ` ${dot}` : ''}`} />
                  <div className="inheritance-addr">{shortAddr(item.addr)}</div>
                  {/* ACTIVE/GRACE: show timer + status label */}
                  {!isClaimable && (
                    <>
                      {timeHint && <span className="inheritance-time-hint">{timeHint}</span>}
                      <span className={`inheritance-status-label${item.vaultStatus === VAULT_STATUS.GRACE ? ' grace' : ''}`}>
                        {badgeText}
                      </span>
                    </>
                  )}
                  {/* CLAIMABLE: show claim button instead of timer */}
                  {isClaimable && (
                    <ClaimActionButton
                      targetAddress={item.addr as `0x${string}`}
                      successorClaimInitiated={item.successorClaimInitiated}
                      claimInitiationTimestamp={item.claimInitiationTimestamp}
                      claimEndAt={claimEndAt}
                      now={now}
                      formatCountdown={formatCountdown}
                      onSuccess={onSuccess}
                    />
                  )}
                </div>
              )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Inline claim action button for CLAIMABLE items ---

function ClaimActionButton({
  targetAddress,
  successorClaimInitiated,
  claimInitiationTimestamp,
  claimEndAt,
  now,
  formatCountdown,
  onSuccess,
}: {
  targetAddress: `0x${string}`
  successorClaimInitiated: boolean
  claimInitiationTimestamp: number
  claimEndAt: number
  now: number
  formatCountdown: (secs: number) => string
  onSuccess?: () => void
}) {
  const { t } = useTranslation()
  const { address } = useAccount()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { showNotification } = useNotification()
  const [confirmComplete, setConfirmComplete] = useState(false)

  const vetoEndsAt = claimInitiationTimestamp + CLAIM_PERIOD_SECONDS
  const vetoPassed = now > vetoEndsAt
  const canComplete = successorClaimInitiated && vetoPassed && now < claimEndAt

  // Initiate claim
  const {
    write: writeInitiate,
    isPending: isInitPending,
    isConfirming: isInitConfirming,
    isSuccess: isInitSuccess,
    reset: resetInit,
    simulationError: initSimError,
    canWrite: canWriteInit,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'initiateSuccessorClaim',
    args: [targetAddress],
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && !successorClaimInitiated,
  })

  // Complete transfer
  const {
    write: writeComplete,
    isPending: isCompPending,
    isConfirming: isCompConfirming,
    isSuccess: isCompSuccess,
    reset: resetComp,
    simulationError: compSimError,
    canWrite: canWriteComp,
  } = useSimulatedWrite({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'completeVaultTransfer',
    args: [targetAddress],
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && canComplete,
  })

  useEffect(() => {
    if (isInitSuccess) {
      showNotification({ type: 'success', title: t('notifications.claim_initiated_title'), message: t('notifications.claim_initiated_msg') })
      resetInit()
      onSuccess?.()
    }
  }, [isInitSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isCompSuccess) {
      showNotification({ type: 'success', title: t('notifications.claim_completed_title'), message: t('notifications.claim_completed_msg') })
      resetComp()
      setConfirmComplete(false)
      onSuccess?.()
    }
  }, [isCompSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = isInitPending || isCompPending
  const isConfirming = isInitConfirming || isCompConfirming

  // State 1: Not yet initiated — show "Отримати спадщину" button
  if (!successorClaimInitiated) {
    return (
      <div className="inheritance-claim-action">
        {initSimError && (
          <span className="inheritance-sim-error" title={initSimError}>!</span>
        )}
        <button
          className="btn btn-primary btn-sm inheritance-claim-btn"
          onClick={(e) => { e.stopPropagation(); if (!assertCorrectChain()) return; writeInitiate() }}
          disabled={isPending || isConfirming || !canWriteInit}
        >
          {isInitPending ? t('claim_vault.confirm_wallet') : isInitConfirming ? t('claim_vault.initiating') : t('claim_vault.initiate_btn')}
        </button>
      </div>
    )
  }

  // State 2: Initiated, veto period active — show countdown
  if (successorClaimInitiated && !vetoPassed) {
    const vetoLeft = vetoEndsAt - now
    return (
      <span className="inheritance-time-hint inheritance-veto-hint">
        {t('claim_vault.veto_closes')} {formatCountdown(vetoLeft)}
      </span>
    )
  }

  // State 3: Veto passed — show "Підтвердити отримання" button (two-step)
  if (canComplete && !confirmComplete) {
    return (
      <div className="inheritance-claim-action">
        {compSimError && (
          <span className="inheritance-sim-error" title={compSimError}>!</span>
        )}
        <button
          className="btn btn-primary btn-sm inheritance-claim-btn"
          onClick={(e) => { e.stopPropagation(); setConfirmComplete(true) }}
          disabled={isPending || isConfirming || !canWriteComp}
        >
          {t('claim_vault.complete_btn')}
        </button>
      </div>
    )
  }

  if (canComplete && confirmComplete) {
    return (
      <div className="inheritance-claim-confirm">
        <span className="inheritance-confirm-warning">{t('claim_vault.confirm_complete_warning')}</span>
        <div className="inheritance-confirm-btns">
          <button
            className="btn btn-danger btn-sm"
            onClick={(e) => { e.stopPropagation(); if (!assertCorrectChain()) return; writeComplete() }}
            disabled={isPending || isConfirming || !canWriteComp}
          >
            {isCompPending ? t('claim_vault.confirm_wallet') : isCompConfirming ? t('claim_vault.completing') : t('claim_vault.confirm_yes')}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={(e) => { e.stopPropagation(); setConfirmComplete(false) }}
          >
            {t('claim_vault.confirm_no')}
          </button>
        </div>
      </div>
    )
  }

  return null
}
