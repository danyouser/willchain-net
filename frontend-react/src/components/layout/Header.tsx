import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'
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
  const { isConnected } = useAccount()
  const [langOpen, setLangOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <header className="header">
      <div className="header-inner">
        <button
          className={`burger${menuOpen ? ' burger-open' : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>

        <a href="/" className="logo">
          <img src="/assets/logo.svg" alt="WillChain" className="logo-icon-img" />
          <span className="logo-text">WillChain</span>
        </a>

        <nav className={`nav${menuOpen ? ' nav-open' : ''}`}>
          {isConnected ? (
            <>
              <a href="https://sepolia.basescan.org/address/0x6fAd1475B41731E3eDA21998417Cb2e18E795877#code" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                {t('footer.contract')}
              </a>
              <a href="https://t.me/WillChainBot" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                {t('footer.bot')}
              </a>
            </>
          ) : (
            <>
              <a href="#how-it-works" onClick={() => setMenuOpen(false)}>{t('nav.how_it_works')}</a>
              <a href="#faq" onClick={() => setMenuOpen(false)}>{t('nav.faq')}</a>
              <a href="#disclaimer" onClick={() => setMenuOpen(false)}>{t('nav.legal')}</a>
            </>
          )}
        </nav>

        {menuOpen && <div className="nav-overlay" onClick={() => setMenuOpen(false)} />}

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
                      <svg className="connect-icon" viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0" fill="currentColor"/></svg>
                      <span className="connect-label">{t('nav.connect_wallet')}</span>
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
                        <span className="chain-name">{chain.name}</span>
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
