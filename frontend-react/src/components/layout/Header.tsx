import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useDisclaimer } from '../../context/DisclaimerContext'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n'

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧', uk: '🇺🇦', ru: '🇷🇺', de: '🇩🇪', fr: '🇫🇷',
  es: '🇪🇸', pt: '🇧🇷', pl: '🇵🇱', it: '🇮🇹', nl: '🇳🇱', tr: '🇹🇷',
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', uk: 'Українська', ru: 'Русский', de: 'Deutsch',
  fr: 'Français', es: 'Español', pt: 'Português', pl: 'Polski',
  it: 'Italiano', nl: 'Nederlands', tr: 'Türkçe',
}

export function Header() {
  const { requireDisclaimer } = useDisclaimer()
  const { t, i18n } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)

  const currentLang = i18n.language.split('-')[0] as SupportedLanguage
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!langOpen) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [langOpen])

  return (
    <header className="header">
      <div className="header-inner">
        <a href="/" className="logo">
          <img src="/assets/logo.svg" alt="WillChain" className="logo-icon-img" />
          <span className="logo-text">WillChain</span>
        </a>

        <nav className="nav">
          <div className="nav-scrollbar"><div className="nav-scrollbar-thumb" /></div>
          <a href="#how-it-works">{t('nav.how_it_works')}</a>
          <a href="#faq">{t('nav.faq')}</a>
          <a href="#disclaimer">{t('nav.legal')}</a>
        </nav>

        <div className="wallet-buttons">
          {/* Language dropdown */}
          <div className={`lang-dropdown${langOpen ? ' open' : ''}`} ref={dropdownRef}>
            <button
              className="lang-dropdown-btn"
              onClick={() => setLangOpen(v => !v)}
              aria-expanded={langOpen}
            >
              <span className="lang-flag">{LANG_FLAGS[currentLang] ?? '🌐'}</span>
              <span className="lang-code">{currentLang.toUpperCase()}</span>
              <svg className="lang-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div className="lang-dropdown-menu">
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang}
                  className="lang-option"
                  onClick={() => { i18n.changeLanguage(lang); setLangOpen(false) }}
                >
                  <span className="lang-flag">{LANG_FLAGS[lang] ?? '🌐'}</span>
                  <span className="lang-name">{LANG_NAMES[lang] ?? lang}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Wallet connect button */}
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted
              const connected = ready && account && chain
              return (
                <div {...(!ready && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' } })}>
                  {!connected ? (
                    <button className="btn btn-primary" onClick={() => requireDisclaimer(openConnectModal)}>
                      {t('nav.connect_wallet')}
                    </button>
                  ) : chain.unsupported ? (
                    <button className="btn btn-danger" onClick={openChainModal}>
                      {t('nav.wrong_network')}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={openChainModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {chain.hasIcon && chain.iconUrl && (
                          <img alt={chain.name ?? ''} src={chain.iconUrl} style={{ width: 16, height: 16, borderRadius: '50%' }} />
                        )}
                        {chain.name}
                      </button>
                      <button className="btn btn-primary" onClick={openAccountModal}>
                        {account.displayName}
                      </button>
                    </div>
                  )}
                </div>
              )
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  )
}
