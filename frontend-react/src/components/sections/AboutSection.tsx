import { useTranslation } from 'react-i18next'

export function AboutSection() {
  const { t } = useTranslation()

  const cards = [
    { img: '/assets/icons/icon-lock.webp', alt: t('problem.card1_title'), titleKey: 'problem.card1_title', descKey: 'problem.card1_desc' },
    { img: '/assets/icons/icon-time.webp', alt: t('problem.card2_title'), titleKey: 'problem.card2_title', descKey: 'problem.card2_desc' },
    { img: '/assets/icons/icon-family.webp', alt: t('problem.card3_title'), titleKey: 'problem.card3_title', descKey: 'problem.card3_desc' },
  ]

  return (
    <section className="problem-section" id="problem-section">
      <div className="section-label">
        <span className="label-glow" />
        {t('problem.label')}
      </div>
      <h2 className="section-title">{t('problem.title')}</h2>
      <p className="section-subtitle">{t('problem.subtitle')}</p>
      <div className="problem-cards">
        {cards.map(c => (
          <div key={c.titleKey} className="problem-card">
            <div className="problem-card-icon">
              <img
                src={c.img}
                alt={c.alt}
                className="ai-icon animated-pulse-scale"
                loading="lazy"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <h3>{t(c.titleKey)}</h3>
            <p>{t(c.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
