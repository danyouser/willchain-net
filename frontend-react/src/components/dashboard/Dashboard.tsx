import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS } from '../../config/contract'
import { useBalance, formatTokenAmount } from '../../hooks/useBalance'
import { useNodeState } from '../../hooks/useNodeState'
import { useIsSmartWallet } from '../../hooks/useIsSmartWallet'
import { TimeCard } from './TimeCard'
import { SuccessorCard } from './SuccessorCard'
import { ClaimVaultCard } from './ClaimVaultCard'
import { RecycleNodeCard } from './RecycleNodeCard'
import { DividendsCard } from './DividendsCard'
import { VaultDataCard } from './VaultDataCard'
import { ActivationCard } from './ActivationCard'
import { IncomingInheritancesCard } from './IncomingInheritancesCard'
import { InactivityPeriodCard } from './InactivityPeriodCard'
import { TransferModal } from '../modals/TransferModal'
import { getStatusClass, getStatusKey } from '../../utils/vaultStatus'

export function Dashboard() {
  const { address, isConnected } = useAccount()
  const { t } = useTranslation()
  const { balance, refetch: refetchBalance } = useBalance(address)
  const { nodeState, isLoading: isNodeLoading, refetch: refetchNode } = useNodeState(address)
  const isSmartWallet = useIsSmartWallet(address)
  const [showTransfer, setShowTransfer] = useState(false)
  const [allowanceWarningDismissed, setAllowanceWarningDismissed] = useState(() =>
    localStorage.getItem('allowance-warning-dismissed') === '1'
  )

  if (!isConnected || !address) {
    return null
  }

  if (isNodeLoading && !nodeState) {
    return (
      <section className="dashboard">
        <div className="dash-loading" role="status" aria-label={t('dashboard.loading')}>
          <div className="dash-skeleton" />
          <div className="dash-skeleton" />
          <div className="dash-skeleton" />
        </div>
      </section>
    )
  }

  const handleRefresh = () => {
    refetchBalance()
    refetchNode()
  }

  const handleAddToken = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).ethereum?.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: CONTRACT_ADDRESS,
            symbol: 'WILL',
            decimals: 18,
          },
        },
      })
    } catch {
      // User rejected or wallet doesn't support wallet_watchAsset
    }
  }

  // ── Derived State ──────────────────────────────────────────
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const isUnregistered = !nodeState || nodeState.lastActivityTimestamp === 0
  const hasSuccessor = !!nodeState?.designatedSuccessor && nodeState.designatedSuccessor !== ZERO_ADDRESS

  const lastActivityLabel = isUnregistered
    ? t('timeline.never')
    : new Date(nodeState!.lastActivityTimestamp * 1000).toLocaleDateString()

  const statusClass = getStatusClass(nodeState)
  const statusText = t(getStatusKey(nodeState))

  // ── UNREGISTERED: Show activation flow only ────────────────
  if (isUnregistered) {
    return (
      <section className="dashboard">
        <div className="dash-flow">
          <ActivationCard onSuccess={handleRefresh} />
        </div>
      </section>
    )
  }

  // ── REGISTERED: Full dashboard ─────────────────────────────
  return (
    <section className="dashboard">
      <div className="dash-layout">

        {/* ── SIDEBAR (Core Status & Action) ────────────────────── */}
        {hasSuccessor && (
          <aside className="dash-sidebar">
            <TimeCard
              timeUntilInactive={nodeState?.timeUntilInactive || 0}
              inactivityPeriod={nodeState?.inactivityPeriod || 90 * 24 * 60 * 60}
              onSuccess={handleRefresh}
            />
          </aside>
        )}

        {/* ── MAIN AREA (Settings & Ecosystem) ──────────────────── */}
        <main className="dash-main">
          {isSmartWallet && (
            <div className="smart-wallet-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', verticalAlign: 'text-bottom', opacity: 0.9 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t('dashboard.smart_wallet_warning')}
            </div>
          )}
 
          {hasSuccessor && !allowanceWarningDismissed && (
            <div className="activity-info-banner">
              <div className="activity-info-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div className="activity-info-content">
                <strong className="activity-info-title">{t('security.allowance_title')}</strong>
                <p className="activity-info-text">{t('security.allowance_text')}</p>
              </div>
              <button
                onClick={() => {
                  setAllowanceWarningDismissed(true)
                  localStorage.setItem('allowance-warning-dismissed', '1')
                }}
                className="activity-info-closebtn"
                aria-label={t('confirm.close') || 'Close'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}


          <div className="dash-tvl-card">
            <div className="dash-tvl-top">
              <div className="dash-tvl-left">
                <span className="dash-tvl-label">{hasSuccessor ? t('dashboard.total_value_secured') : t('dashboard.balance_label')}</span>
                <div className="dash-tvl-balance">{formatTokenAmount(balance)} <span className="currency">WILL</span></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'stretch', minWidth: '160px' }}>
                <button
                  className="dash-send-btn-compact"
                  onClick={() => setShowTransfer(true)}
                  title={t('dashboard.send_btn')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                  {t('dashboard.send_btn')}
                </button>
                <button
                  className="dash-send-btn-compact"
                  onClick={handleAddToken}
                  title={t('dashboard.add_token_btn')}
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  {t('dashboard.add_token_btn')}
                </button>
              </div>
            </div>
            
            {hasSuccessor && (
              <div className="dash-tvl-bottom">
                <div className="dash-tvl-metrics">
                  <div className="dash-tvl-metric">
                    <span className="lbl">{t('dashboard.status_label')}</span>
                    <div style={{ marginTop: 'auto' }}>
                      <span className={`status-badge ${statusClass}`}>● {statusText}</span>
                    </div>
                  </div>
                  <div className="dash-tvl-metric" style={{ marginLeft: '12px' }}>
                    <span className="lbl">{t('timeline.last_activity')}</span>
                    <span className="val" style={{ marginTop: 'auto' }}>{lastActivityLabel}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="dash-section-label" style={{ marginTop: '8px' }}>{t('dashboard.will_configuration')}</div>
          {hasSuccessor ? (
            <div className="dash-grid-2">
              <SuccessorCard
                currentSuccessor={nodeState?.designatedSuccessor || ''}
                onSuccess={handleRefresh}
                timeline={{
                  lastActivity: nodeState!.lastActivityTimestamp,
                  inactivityPeriod: nodeState!.inactivityPeriod,
                  timeUntilInactive: nodeState!.timeUntilInactive,
                  timeUntilAbandoned: nodeState!.timeUntilAbandoned,
                }}
              />
              <InactivityPeriodCard
                currentPeriod={nodeState?.inactivityPeriod || 90 * 24 * 60 * 60}
                onSuccess={handleRefresh}
              />
            </div>
          ) : (
            <div className="dash-grid-1">
              <SuccessorCard
                currentSuccessor={nodeState?.designatedSuccessor || ''}
                onSuccess={handleRefresh}
              />
            </div>
          )}

          <div className="dash-section-label" style={{ marginTop: '12px' }}>{t('dashboard.heir_section')}</div>
          <div className="dash-grid-2">
            <IncomingInheritancesCard />
            <ClaimVaultCard
              mySuccessorClaimInitiated={nodeState?.successorClaimInitiated ?? false}
              myClaimInitiationTimestamp={nodeState?.claimInitiationTimestamp ?? 0}
              onSuccess={handleRefresh}
            />
          </div>

          {hasSuccessor && (
            <div style={{ marginTop: '12px' }}>
              <VaultDataCard onSuccess={handleRefresh} />
            </div>
          )}

          <div className="dash-section-label" style={{ marginTop: '12px' }}>{t('dashboard.ecosystem_section')}</div>
          <div className="dash-grid-2">
            <RecycleNodeCard onSuccess={handleRefresh} />
            <DividendsCard onSuccess={handleRefresh} />
          </div>
        </main>

      </div>



      <TransferModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        balance={balance}
      />
    </section>
  )
}
