import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount, useReadContracts } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { VAULT_STATUS } from '../../utils/vaultStatus'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? '/api'

type InheritanceItem = { addr: string; vaultStatus: number; designatedSuccessor: string }

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function IncomingInheritancesCard() {
  const { t } = useTranslation()
  const { address } = useAccount()

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

  // Batch-read vaultStatus + designatedSuccessor for each owner
  const contracts = owners.flatMap(addr => [
    {
      address: CONTRACT_ADDRESS,
      abi: WILLCHAIN_ABI,
      functionName: 'getVaultStatus' as const,
      args: [addr as `0x${string}`],
      chainId: CHAIN_ID,
    },
    {
      address: CONTRACT_ADDRESS,
      abi: WILLCHAIN_ABI,
      functionName: 'nodeStates' as const,
      args: [addr as `0x${string}`],
      chainId: CHAIN_ID,
    },
  ])

  const { data: contractData, isLoading: isReadLoading } = useReadContracts({
    contracts,
    query: { enabled: owners.length > 0 },
  })

  // Build items array, filtering out entries where successor changed
  const items: InheritanceItem[] = []
  if (contractData && address) {
    for (let i = 0; i < owners.length; i++) {
      const statusResult = contractData[i * 2]
      const stateResult  = contractData[i * 2 + 1]
      if (statusResult?.status !== 'success' || stateResult?.status !== 'success') continue
      // nodeStates returns a tuple; index 1 = designatedSuccessor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeState = stateResult.result as any
      const designatedSuccessor: string = nodeState?.[1] ?? nodeState?.designatedSuccessor ?? ''
      if (designatedSuccessor.toLowerCase() !== address.toLowerCase()) continue
      items.push({
        addr: owners[i],
        vaultStatus: Number(statusResult.result),
        designatedSuccessor,
      })
    }
  }

  const statusLabel: Record<number, string> = {
    [VAULT_STATUS.UNREGISTERED]: '—',
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
    <div className={`card${items.length > 0 ? ' card-span-2' : ''}`}>
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="7 17 17 7"/>
            <polyline points="7 7 17 7 17 17"/>
          </svg>
          {t('dashboard.incoming_inheritances')}
        </span>
      </div>
      <div className="card-body">
        {isSpinner && (
          <p className="card-hint">{t('claim_vault.incoming_loading', '⏳ Loading...')}</p>
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
            {items.map(item => {
              const isClaimable = item.vaultStatus === VAULT_STATUS.CLAIMABLE
              const badgeText = (statusLabel[item.vaultStatus] ?? '—')
              const dot = dotClass[item.vaultStatus] ?? ''
              return (
                <div
                  key={item.addr}
                  className={`inheritance-item${isClaimable ? ' claimable' : ''}`}
                >
                  <div className={`inheritance-status-dot${dot ? ` ${dot}` : ''}`} />
                  <div className="inheritance-addr">{shortAddr(item.addr)}</div>
                  {badgeText !== '—' && (
                    <span className={`inheritance-status-label${isClaimable ? ' claimable' : item.vaultStatus === VAULT_STATUS.GRACE ? ' grace' : ''}`}>
                      {badgeText}
                    </span>
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
