import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTokenAmount } from '../../hooks/useBalance'
import { TransferModal } from '../modals/TransferModal'

interface BalanceCardProps {
  balance: bigint
  tierName: string
}

export function BalanceCard({ balance, tierName }: BalanceCardProps) {
  const [showTransfer, setShowTransfer] = useState(false)
  const { t } = useTranslation()

  return (
    <>
      <div className="card">
        <h3>{t('dashboard.balance_label')}</h3>
        <div className="card-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/assets/logo.svg" alt="WILL" style={{ width: '28px', height: '28px' }} />
          {formatTokenAmount(balance)} WILL
        </div>
        <span className="card-tier">{tierName}</span>
        <button className="btn btn-primary btn-full" onClick={() => setShowTransfer(true)}>
          {t('dashboard.send_btn')}
        </button>
      </div>
      <TransferModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        balance={balance}
      />
    </>
  )
}
