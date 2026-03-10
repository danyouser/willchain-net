import { useState, useEffect } from 'react'
import { parseEther, isAddress } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../../config/contract'
import { CHAIN_ID } from '../../config/wagmi'
import { useNotification } from '../../context/NotificationContext'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useModalA11y } from '../../hooks/useModalA11y'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  balance: bigint
}

export function TransferModal({ isOpen, onClose, balance }: TransferModalProps) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const { showNotification } = useNotification()
  const { t } = useTranslation()

  const { assertCorrectChain } = useChainGuard()
  const modalRef = useModalA11y(isOpen, onClose)
  const { writeContract, data: hash, isPending, reset } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const handleTransfer = async () => {
    if (!assertCorrectChain()) return
    if (!recipient || !amount) {
      showNotification({ type: 'warning', title: t('notifications.missing_fields_title'), message: t('notifications.missing_fields_msg') })
      return
    }
    if (!isAddress(recipient)) {
      showNotification({ type: 'error', title: t('notifications.invalid_address_title'), message: t('notifications.invalid_address_msg') })
      return
    }

    let amountWei: bigint
    try {
      amountWei = parseEther(amount)
    } catch {
      showNotification({ type: 'error', title: t('notifications.invalid_amount_title'), message: t('notifications.invalid_amount_msg') })
      return
    }
    if (amountWei === 0n || amountWei > balance) {
      showNotification({ type: 'error', title: t('notifications.insufficient_balance_title'), message: t('notifications.insufficient_balance_msg') })
      return
    }

    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: WILLCHAIN_ABI,
        functionName: 'transfer',
        chainId: CHAIN_ID,
        args: [recipient as `0x${string}`, amountWei],
      })
    } catch (error) {
      console.error('Transfer error:', error)
    }
  }

  useEffect(() => {
    if (isSuccess) {
      showNotification({
        type: 'success',
        title: t('notifications.transfer_success_title'),
        message: `${t('notifications.transfer_success_msg')} ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
        tip: t('notifications.transfer_success_tip'),
      })
      reset()
      onClose()
      setTimeout(() => { setRecipient(''); setAmount('') }, 0)
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const formatBalance = (bal: bigint) => {
    const formatted = Number(bal) / 1e18
    return Math.floor(formatted).toLocaleString('en-US')
  }

  return (
    <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title">
      <div className="modal-overlay" onClick={onClose} aria-hidden="true" />
      <div className="modal-content modal-transfer">
        <div className="modal-header">
          <h2 id="transfer-modal-title">{t('transfer_modal.title')}</h2>
          <p className="modal-subtitle">{t('transfer_modal.subtitle')}</p>
        </div>
        <div className="modal-body">
          <div className="info-banner" style={{
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.82rem',
            color: 'var(--t2)',
            lineHeight: 1.5,
          }}>
            ℹ️ {t('transfer_modal.activity_reset_hint')}
          </div>
          <div className="form-group">
            <label>{t('transfer_modal.to_label')}</label>
            <input
              type="text"
              className="input"
              placeholder={t('transfer_modal.to_placeholder')}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              aria-label={t('transfer_modal.to_label')}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>{t('transfer_modal.amount_label')}</label>
            <input
              type="number"
              className="input"
              placeholder={t('transfer_modal.amount_placeholder')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label={t('transfer_modal.amount_label')}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
              {t('transfer_modal.available')} {formatBalance(balance)} WILL
            </p>
          </div>
        </div>
        <div className="modal-footer" style={{ border: 'none', background: 'transparent' }}>
          <div className="modal-buttons">
            <button className="btn btn-secondary" onClick={onClose}>
              {t('transfer_modal.cancel_btn')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleTransfer}
              disabled={isPending || isConfirming}
            >
              {isPending ? t('claim_vault.confirm_wallet') : isConfirming ? t('transfer_modal.sending') : t('transfer_modal.send_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
