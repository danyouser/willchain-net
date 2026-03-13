import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount, useReadContract, useReadContracts, useWatchContractEvent } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI, GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { VAULT_STATUS } from '../../utils/vaultStatus'
import { formatTokenAmount } from '../../hooks/useBalance'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? '/api'

interface DashboardAlertsProps {
  ethBalance: bigint
  claimInProgress: boolean
  timeUntilInactive: number
  inactivityPeriod: number
  hasSuccessor: boolean
  isRegistered: boolean
  vaultStatus: number
  onIncomingData?: (count: number, hasClaimable: boolean) => void
}

interface AlertItem {
  id: string
  type: 'info' | 'success' | 'warning' | 'danger'
  text: string
}

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem('dashboard-dismissed-alerts')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveDismissed(set: Set<string>) {
  sessionStorage.setItem('dashboard-dismissed-alerts', JSON.stringify([...set]))
}

export function DashboardAlerts({ ethBalance, claimInProgress, timeUntilInactive, hasSuccessor, isRegistered, vaultStatus, onIncomingData }: DashboardAlertsProps) {
  const { t } = useTranslation()
  const { address } = useAccount()
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [expanded, setExpanded] = useState(false)

  // Clear dismissed alerts when wallet changes
  useEffect(() => {
    setDismissed(new Set())
    saveDismissed(new Set())
  }, [address])

  // --- Incoming inheritances (same logic as IncomingInheritancesCard) ---
  const [owners, setOwners] = useState<string[]>([])
  const [fetched, setFetched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!address) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const run = async () => {
      try {
        const res = await fetch(`${BOT_API_URL}/successors/${address.toLowerCase()}`, { signal: controller.signal })
        const json = res.ok ? await res.json() : { owners: [] }
        setOwners(Array.isArray(json.owners) ? json.owners : [])
      } catch {
        if (!controller.signal.aborted) setOwners([])
      } finally {
        if (!controller.signal.aborted) setFetched(true)
      }
    }
    run()
    return () => { controller.abort() }
  }, [address])

  // Read nodeStates for each owner and derive status client-side
  const contracts = owners.map(addr => ({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, functionName: 'nodeStates' as const,
    args: [addr as `0x${string}`], chainId: CHAIN_ID,
  }))

  const { data: contractData } = useReadContracts({
    contracts,
    query: { enabled: owners.length > 0 },
  })

  const incomingCount = useMemo(() => {
    if (!contractData || !address) return 0
    return owners.filter((_, i) => {
      if (contractData[i]?.status !== 'success') return false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ns = contractData[i].result as any
      const successor: string = ns?.[4] ?? ''
      return successor.toLowerCase() === address.toLowerCase()
    }).length
  }, [contractData, owners, address])

  const hasClaimable = useMemo(() => {
    if (!contractData || !address) return false
    const now = Math.floor(Date.now() / 1000)
    return owners.some((_, i) => {
      if (contractData[i]?.status !== 'success') return false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ns = contractData[i].result as any
      const successor: string = ns?.[4] ?? ''
      if (successor.toLowerCase() !== address.toLowerCase()) return false
      const lastActivity = Number(ns?.[0] ?? 0)
      if (lastActivity === 0) return false
      const inactPeriod = Number(ns?.[2] ?? 0) || 90 * 24 * 60 * 60
      const graceEnd = lastActivity + inactPeriod + GRACE_PERIOD_SECONDS
      const claimEnd = graceEnd + CLAIM_PERIOD_SECONDS
      return now >= graceEnd && now < claimEnd
    })
  }, [contractData, owners, address])

  // Notify parent about incoming inheritance data
  useEffect(() => {
    if (fetched) onIncomingData?.(incomingCount, hasClaimable)
  }, [fetched, incomingCount, hasClaimable]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Pending dividends ---
  const { data: pendingRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'pendingDividends',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
  const pendingDividends = (pendingRaw as bigint | undefined) ?? 0n

  // --- Transfer event watcher ---
  const [txAlerts, setTxAlerts] = useState<AlertItem[]>([])
  const txIdCounter = useRef(0)

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    eventName: 'Transfer',
    onLogs(logs) {
      if (!address) return
      const addrLower = address.toLowerCase()
      for (const log of logs) {
        const { from, to, value } = log.args as { from: string; to: string; value: bigint }
        if (!from || !to || !value) continue
        const fromLower = from.toLowerCase()
        const toLower = to.toLowerCase()
        const amount = formatTokenAmount(value)
        const id = `tx-${++txIdCounter.current}`

        if (toLower === addrLower && fromLower !== addrLower) {
          const shortFrom = `${from.slice(0, 6)}...${from.slice(-4)}`
          setTxAlerts(prev => [...prev, {
            id,
            type: 'success',
            text: t('dashboard.alert_tx_received', { amount, from: shortFrom }),
          }])
        } else if (fromLower === addrLower && toLower !== addrLower) {
          const shortTo = `${to.slice(0, 6)}...${to.slice(-4)}`
          setTxAlerts(prev => [...prev, {
            id,
            type: 'info',
            text: t('dashboard.alert_tx_sent', { amount, to: shortTo }),
          }])
        }
      }
    },
    poll: true,
    pollingInterval: 4_000,
    enabled: !!address,
  })

  const dismissTxAlert = (id: string) => {
    setTxAlerts(prev => prev.filter(a => a.id !== id))
  }

  // --- Successor change event watcher ---
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    eventName: 'SuccessorDesignated',
    onLogs(logs) {
      if (!address) return
      const addrLower = address.toLowerCase()
      for (const log of logs) {
        const { node, successor } = log.args as { node: string; successor: string }
        if (!node || !successor) continue
        const id = `tx-${++txIdCounter.current}`

        if (node.toLowerCase() === addrLower) {
          const shortSuccessor = `${successor.slice(0, 6)}...${successor.slice(-4)}`
          setTxAlerts(prev => [...prev, {
            id,
            type: 'success',
            text: t('dashboard.alert_successor_changed', { successor: shortSuccessor }),
          }])
        } else if (successor.toLowerCase() === addrLower) {
          const shortNode = `${node.slice(0, 6)}...${node.slice(-4)}`
          setTxAlerts(prev => [...prev, {
            id,
            type: 'info',
            text: t('dashboard.alert_designated_as_successor', { node: shortNode }),
          }])
        }
      }
    },
    poll: true,
    pollingInterval: 4_000,
    enabled: !!address,
  })

  // --- Claim initiated / cancelled / transferred / recycled / dividends / activity ---
  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'SuccessorClaimInitiated',
    onLogs(logs) {
      if (!address) return
      const addrLower = address.toLowerCase()
      for (const log of logs) {
        const { node, successor } = log.args as { node: string; successor: string }
        if (!node || !successor) continue
        const id = `tx-${++txIdCounter.current}`
        if (node.toLowerCase() === addrLower) {
          const short = `${successor.slice(0, 6)}...${successor.slice(-4)}`
          setTxAlerts(prev => [...prev, { id, type: 'danger', text: t('dashboard.alert_claim_initiated_owner', { successor: short }) }])
        } else if (successor.toLowerCase() === addrLower) {
          const short = `${node.slice(0, 6)}...${node.slice(-4)}`
          setTxAlerts(prev => [...prev, { id, type: 'success', text: t('dashboard.alert_claim_initiated_heir', { node: short }) }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'SuccessorClaimCancelled',
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const { node } = log.args as { node: string }
        if (node?.toLowerCase() === address.toLowerCase()) {
          const id = `tx-${++txIdCounter.current}`
          setTxAlerts(prev => [...prev, { id, type: 'success', text: t('dashboard.alert_claim_cancelled') }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'VaultAccessTransferred',
    onLogs(logs) {
      if (!address) return
      const addrLower = address.toLowerCase()
      for (const log of logs) {
        const { fromNode, toNode, amount } = log.args as { fromNode: string; toNode: string; amount: bigint }
        if (!fromNode || !toNode) continue
        const id = `tx-${++txIdCounter.current}`
        const amt = formatTokenAmount(amount)
        if (toNode.toLowerCase() === addrLower) {
          const short = `${fromNode.slice(0, 6)}...${fromNode.slice(-4)}`
          setTxAlerts(prev => [...prev, { id, type: 'success', text: t('dashboard.alert_vault_received', { amount: amt, from: short }) }])
        } else if (fromNode.toLowerCase() === addrLower) {
          const short = `${toNode.slice(0, 6)}...${toNode.slice(-4)}`
          setTxAlerts(prev => [...prev, { id, type: 'danger', text: t('dashboard.alert_vault_transferred', { amount: amt, to: short }) }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'InactiveNodeRecycled',
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const { node } = log.args as { node: string }
        if (node?.toLowerCase() === address.toLowerCase()) {
          const id = `tx-${++txIdCounter.current}`
          setTxAlerts(prev => [...prev, { id, type: 'danger', text: t('dashboard.alert_recycled') }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'DividendsClaimed',
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const { node, amount } = log.args as { node: string; amount: bigint }
        if (node?.toLowerCase() === address.toLowerCase()) {
          const id = `tx-${++txIdCounter.current}`
          setTxAlerts(prev => [...prev, { id, type: 'success', text: t('dashboard.alert_dividends_claimed', { amount: formatTokenAmount(amount) }) }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  useWatchContractEvent({
    address: CONTRACT_ADDRESS, abi: WILLCHAIN_ABI, eventName: 'ActivityConfirmed',
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const { node } = log.args as { node: string }
        if (node?.toLowerCase() === address.toLowerCase()) {
          const id = `tx-${++txIdCounter.current}`
          setTxAlerts(prev => [...prev, { id, type: 'success', text: t('dashboard.alert_activity_confirmed') }])
        }
      }
    },
    poll: true, pollingInterval: 4_000, enabled: !!address,
  })

  // --- Build alerts ---
  const alerts: AlertItem[] = []

  // Priority: danger → warning → success → info
  if (claimInProgress) {
    alerts.push({ id: 'claim-in-progress', type: 'danger', text: t('dashboard.alert_claim_danger') })
  }

  if (isRegistered && vaultStatus === VAULT_STATUS.GRACE) {
    alerts.push({ id: 'grace-period', type: 'danger', text: t('dashboard.alert_grace') })
  }

  if (ethBalance === 0n) {
    alerts.push({ id: 'no-gas', type: 'danger', text: t('dashboard.alert_no_gas') })
  }

  const SEVEN_DAYS = 7 * 24 * 60 * 60
  if (isRegistered && hasSuccessor && timeUntilInactive > 0 && timeUntilInactive < SEVEN_DAYS && vaultStatus !== VAULT_STATUS.GRACE) {
    const daysLeft = Math.ceil(timeUntilInactive / 86400)
    alerts.push({ id: 'timer-warning', type: 'warning', text: t('dashboard.alert_timer_warning', { days: daysLeft }) })
  }

  if (isRegistered && !hasSuccessor) {
    alerts.push({ id: 'no-successor', type: 'warning', text: t('dashboard.alert_no_successor') })
  }

  if (isRegistered && hasSuccessor && vaultStatus === VAULT_STATUS.ACTIVE) {
    alerts.push({ id: 'will-active', type: 'success', text: t('dashboard.alert_will_active') })
  }

  if (fetched && hasClaimable) {
    alerts.push({ id: `claimable-vault:${incomingCount}`, type: 'success', text: t('dashboard.alert_claimable') })
  } else if (fetched && incomingCount > 0) {
    alerts.push({ id: `incoming-inheritance:${incomingCount}`, type: 'info', text: t('dashboard.alert_incoming', { count: incomingCount }) })
  }

  if (pendingDividends > 0n) {
    alerts.push({ id: 'pending-dividends', type: 'info', text: t('dashboard.alert_dividends', { amount: formatTokenAmount(pendingDividends) }) })
  }

  // Merge: tx alerts first (newest on top), then static alerts
  const staticVisible = alerts.filter(a => !dismissed.has(a.id))
  const visible = [...txAlerts, ...staticVisible]

  const handleDismiss = (id: string) => {
    if (id.startsWith('tx-')) {
      dismissTxAlert(id)
    } else {
      setDismissed(prev => {
        const next = new Set(prev)
        next.add(id)
        saveDismissed(next)
        return next
      })
    }
  }

  // Auto-close dropdown when only 1 alert remains
  useEffect(() => {
    if (visible.length <= 1) setExpanded(false)
  }, [visible.length])

  if (visible.length === 0) return null

  const current = visible[0]
  const typeColor = {
    danger: 'var(--red)',
    warning: 'var(--amber)',
    success: 'var(--green)',
    info: 'var(--blue)',
  }[current.type]

  return (
    <div className="dashboard-alerts-bar">
      {/* Collapsed: single line with first alert preview + count badge */}
      <div
        className={`dashboard-alert-row ${current.type}`}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded) }}
      >
        <AlertIcon type={current.type} />
        <span className="dashboard-alert-text">{current.text}</span>
        <span className="dashboard-alert-count" style={{ background: typeColor }}>
          {visible.length}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`dashboard-alert-chevron${expanded ? ' expanded' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded: all alerts with dismiss buttons */}
      <div className={`dashboard-alert-dropdown-wrap${expanded ? ' open' : ''}`}>
        <div className="dashboard-alert-dropdown">
          {visible.map(alert => (
            <div key={alert.id} className={`dashboard-alert-item ${alert.type}`}>
              <AlertIcon type={alert.type} />
              <span className="dashboard-alert-text">{alert.text}</span>
              <button
                type="button"
                className="dashboard-alert-close"
                onClick={e => { e.stopPropagation(); handleDismiss(alert.id) }}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AlertIcon({ type }: { type: string }) {
  if (type === 'danger' || type === 'warning') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dashboard-alert-icon">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    )
  }
  if (type === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dashboard-alert-icon">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dashboard-alert-icon">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  )
}
