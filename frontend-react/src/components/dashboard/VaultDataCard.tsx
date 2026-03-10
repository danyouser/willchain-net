import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useSimulatedWrite } from '../../hooks/useSimulatedWrite'

interface VaultDataCardProps {
  onSuccess?: () => void
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

export function VaultDataCard({ onSuccess }: VaultDataCardProps) {
  const [input, setInput] = useState('')
  const { showNotification } = useNotification()
  const { assertCorrectChain, isCorrectChain } = useChainGuard()
  const { address } = useAccount()
  const { t } = useTranslation()

  const isValidHash = /^0x[0-9a-fA-F]{64}$/.test(input) && input !== ZERO_HASH

  const { data: nodeStatesData, refetch: refetchHash } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'nodeStates',
    chainId: CHAIN_ID,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const currentHash = nodeStatesData ? (nodeStatesData as readonly unknown[])[4] as `0x${string}` : undefined
  const hasStoredHash = currentHash && currentHash !== ZERO_HASH

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
    functionName: 'updateVaultData',
    args: isValidHash ? [input as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    enabled: isCorrectChain && !!address && isValidHash,
  })

  const handleUpdate = () => {
    if (!assertCorrectChain()) return
    if (!isValidHash) {
      showNotification({
        type: 'error',
        title: t('notifications.invalid_hash_title'),
        message: t('notifications.invalid_hash_msg'),
      })
      return
    }
    write()
  }

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.vault_data_title'),
        message: t('notifications.vault_data_msg'),
        tip: t('notifications.vault_data_tip'),
      })
      reset()
      onSuccess?.()
      refetchHash()
      setTimeout(() => setInput(''), 0)
    }
  }, [isSuccess, onSuccess, reset, showNotification, refetchHash]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          {t('dashboard.vault_data_label')}
        </span>
      </div>
      <div className="card-body">
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {t('dashboard.vault_data_hint')}
      </p>
      {hasStoredHash && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {t('dashboard.vault_data_current')}{' '}
          <code style={{ color: 'var(--text-primary)' }}>{currentHash}</code>
        </p>
      )}
      <input
        type="text"
        className="input"
        placeholder="0x... (32-byte hash)"
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      {input && !isValidHash && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
          ⚠ {t('notifications.hash_format_error')}
        </p>
      )}
      {isValidHash && simulationError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
          ⚠ {simulationError}
        </p>
      )}
      <button
        className="btn btn-primary btn-full"
        onClick={handleUpdate}
        disabled={!isValidHash || isPending || isConfirming || (isValidHash && !canWrite)}
      >
        {isPending
          ? t('claim_vault.confirm_wallet')
          : isConfirming
          ? t('dashboard.checkin_confirming')
          : t('dashboard.vault_data_set_btn')}
      </button>
      </div>
    </div>
  )
}
