import { useTranslation } from 'react-i18next'
import { useNetworkStats } from '../../hooks/useNetworkStats'
import { useDisclaimer } from '../../context/DisclaimerContext'
import { ConnectButton } from '@rainbow-me/rainbowkit'
export function HeroSection() {
  const { stats } = useNetworkStats()
  const { t } = useTranslation()
  const { requireDisclaimer } = useDisclaimer()

  const fmt = (n: bigint) => {
    const w = n / 10n ** 18n
    if (w >= 1_000_000_000n) return (Number(w) / 1_000_000_000).toFixed(1) + 'B'
    if (w >= 1_000_000n) return (Number(w) / 1_000_000).toFixed(1) + 'M'
    return Number(w).toLocaleString('en-US')
  }

  return (
    <section className="hero">
      <div className="hero-badge">
        <span className="glow-dot" />
        {t('hero.badge')}
      </div>

      <h1>{t('hero.title')}</h1>
      <p className="hero-subtitle" dangerouslySetInnerHTML={{ __html: t('hero.subtitle') }} />

      <div className="hero-cta">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) =>
            mounted ? (
              <button
                className="btn btn-primary btn-large"
                onClick={() => requireDisclaimer(openConnectModal)}
              >
                {t('hero.cta_connect')}
              </button>
            ) : null
          }
        </ConnectButton.Custom>
        <a href="#how-it-works" className="btn btn-outline btn-large">
          {t('hero.cta_how')}
        </a>
      </div>

      <div className="hero-scene-wrap">
        <img
          src="/assets/hero-scene.webp"
          alt="WillChain"
          className="hero-scene-img"
          fetchPriority="high"
          decoding="async"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">
              {stats ? fmt(stats.totalSupply) : '1,000,000,000'}
            </span>
            <span className="stat-label">{t('hero.stat_supply')}</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">
              {stats ? fmt(stats.removedFromCirculation) : '0'}
            </span>
            <span className="stat-label">{t('hero.stat_burned')}</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">
              {stats ? fmt(stats.totalSupply - stats.removedFromCirculation) : '0'}
            </span>
            <span className="stat-label">{t('hero.stat_recycled')}</span>
          </div>
        </div>
        <div className="hero-trust">
          <div className="trust-item">
            <svg className="trust-icon" viewBox="0 0 24 24" fill="none"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="trust-label">{t('trust.opensource_title')}</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <svg className="trust-icon" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="trust-label">{t('trust.verified_title')}</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <svg className="trust-icon" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span className="trust-label">{t('trust.noncustodial_title')}</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <svg className="trust-icon" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="trust-label">{t('trust.base_title')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
