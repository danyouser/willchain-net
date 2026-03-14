import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount, useSignTypedData } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { CHAIN_ID } from '../../config/wagmi'
import { useModalA11y } from '../../hooks/useModalA11y'

const EIP712_DOMAIN = {
  name: 'WillChain',
  version: '1',
  chainId: CHAIN_ID,
} as const

const EIP712_TYPES = {
  WalletLink: [
    { name: 'wallet',     type: 'address' },
    { name: 'telegramId', type: 'uint256' },
    { name: 'nonce',      type: 'bytes32' },
  ],
} as const

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? '/api'

/**
 * Triggered automatically when the URL contains ?tgid=...&addr=...&nonce=...
 * (the bot sends users a deeplink with these params).
 */
export function TgLinkModal() {
  const { t } = useTranslation()
  const { address } = useAccount()
  const { openConnectModal } = useConnectModal()

  const [params, setParams] = useState<{ tgid: string; addr: string; nonce: string } | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const handleClose = useCallback(() => setIsOpen(false), [])
  const modalRef = useModalA11y(isOpen, handleClose)

  // Parse URL params on mount
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const tgid  = sp.get('tgid')
    const addr  = sp.get('addr')
    const nonce = sp.get('nonce')
    if (tgid && addr && nonce) {
      setParams({ tgid, addr, nonce })
      setIsOpen(true)
    }
  }, [])

  const { signTypedData, isPending: isSigning } = useSignTypedData()

  const handleSign = async () => {
    if (!params || !address) return
    setErrorMsg('')
    setStatus('signing')

    try {
      signTypedData(
        {
          domain: EIP712_DOMAIN,
          types: EIP712_TYPES,
          primaryType: 'WalletLink',
          message: {
            wallet:     params.addr as `0x${string}`,
            telegramId: BigInt(params.tgid),
            nonce:      params.nonce as `0x${string}`,
          },
        },
        {
          onSuccess: async (sig) => {
            try {
              const res = await fetch(`${BOT_API_URL}/verify-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tgid: params.tgid, addr: params.addr, nonce: params.nonce, sig }),
              })
              const data = await res.json()
              if (data.ok) {
                setStatus('success')
                // Clean URL params
                const url = new URL(window.location.href)
                url.searchParams.delete('tgid')
                url.searchParams.delete('addr')
                url.searchParams.delete('nonce')
                window.history.replaceState({}, '', url.toString())
              } else {
                throw new Error(data.error || 'Verification failed')
              }
            } catch (err) {
              setStatus('error')
              setErrorMsg(err instanceof Error ? err.message : String(err))
            }
          },
          onError: (err) => {
            setStatus('error')
            const msg = err?.message ?? ''
            if (msg.includes('User rejected') || msg.includes('denied')) {
              setErrorMsg(t('telegram.link_modal_cancelled'))
            } else {
              setErrorMsg(msg || t('notifications.failed_title', 'Failed'))
            }
          },
        }
      )
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  if (!isOpen || !params) return null

  const shortAddr = `${params.addr.slice(0, 6)}...${params.addr.slice(-4)}`

  return (
    <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="tglink-modal-title">
      <div className="modal-overlay" onClick={() => setIsOpen(false)} aria-hidden="true" />
      <div className="modal-content modal-tglink">
        <div className="notification-icon tglink" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <h3 id="tglink-modal-title">{t('telegram.link_modal_title')}</h3>
        <p className="tg-link-address">
          {t('telegram.link_modal_address')}: <strong>{shortAddr}</strong>
        </p>
        <p className="tg-link-hint">{t('telegram.link_modal_hint')}</p>

        {status === 'error' && (
          <p className="tg-link-error">{errorMsg}</p>
        )}

        {status === 'success' ? (
          <p className="tg-link-success">{t('telegram.link_modal_success')}</p>
        ) : (
          <div className="modal-buttons">
            <button
              className="btn btn-secondary"
              onClick={() => setIsOpen(false)}
            >
              {t('telegram.link_modal_cancel_btn')}
            </button>
            {address ? (
              <button
                className="btn btn-primary"
                onClick={handleSign}
                disabled={isSigning || status === 'signing'}
              >
                {isSigning || status === 'signing'
                  ? t('telegram.link_modal_signing')
                  : t('telegram.link_modal_sign_btn')}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => openConnectModal?.()}
              >
                {t('nav.connect_wallet')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
