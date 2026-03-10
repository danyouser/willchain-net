import { useTranslation } from 'react-i18next'

export function DemoSection() {
  const { t } = useTranslation()

  return (
    <section className="demo-section" id="demo-section">
      <div className="container">
        <div className="demo-cards">
          <div className="demo-card demo-step">
            <div className="dc-inner">
              <img src="/assets/logo.svg" className="dc-token-icon" alt="WILL" />
              <div className="dc-addr">0x742d...35Cb</div>
              <div className="dc-balance">485,000 WILL</div>
              <button className="dc-btn dc-btn-pulse">{t('demo.card1_btn')}</button>
            </div>
            <div className="dc-label">{t('demo.card1_label')}</div>
          </div>

          <div className="demo-arrow-h">›</div>

          <div className="demo-card demo-step">
            <div className="dc-inner">
              <div className="dc-field-label">{t('demo.card2_field')}</div>
              <div className="dc-field">
                <span className="dc-field-text">0x1a2b...3c4d</span><span className="dc-cursor"></span>
              </div>
              <button className="dc-btn">{t('demo.card2_btn')}</button>
            </div>
            <div className="dc-label">{t('demo.card2_label')}</div>
          </div>

          <div className="demo-arrow-h">›</div>

          <div className="demo-card demo-step">
            <div className="dc-inner">
              <div className="dc-timer-wrap">
                <svg className="dc-timer-svg" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.07)" strokeWidth="7" fill="none"/>
                  <circle cx="60" cy="60" r="52" stroke="url(#dcg1)" strokeWidth="7" fill="none"
                    strokeDasharray="327" strokeDashoffset="0"
                    strokeLinecap="round" transform="rotate(-90 60 60)"
                    className="demo-timer-ring"/>
                  <defs>
                    <linearGradient id="dcg1" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#3b82f6"/>
                      <stop offset="100%" stopColor="#7c3aed"/>
                    </linearGradient>
                  </defs>
                  <text x="60" y="56" textAnchor="middle" fill="white" fontSize="22" fontFamily="Inter,sans-serif" fontWeight="700">180</text>
                  <text x="60" y="72" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="Inter,sans-serif">{t('dashboard.timer_days')}</text>
                </svg>
              </div>
              <div className="dc-badge-red">{t('demo.card3_badge')}</div>
            </div>
            <div className="dc-label">{t('demo.card3_label')}</div>
          </div>

          <div className="demo-arrow-h">›</div>

          <div className="demo-card demo-card-green demo-step">
            <div className="dc-inner">
              <div className="dc-heir-addr">0x1a2b...3c4d</div>
              <div className="dc-check-wrap">
                <svg className="dc-check-svg" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5"/>
                  <path d="M25 40 l10 10 l20 -20" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" className="demo-check"/>
                </svg>
              </div>
              <div className="dc-amount">+485,000 WILL</div>
              <div className="dc-amount-sub">{t('demo.card4_sub')}</div>
            </div>
            <div className="dc-label">{t('demo.card4_label')}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
