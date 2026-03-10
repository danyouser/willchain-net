import { useTranslation } from 'react-i18next'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [1, 2, 3, 4].map(n => ({
    n,
    title: t(`how_it_works.step${n}_title`),
    desc:  t(`how_it_works.step${n}_desc`),
  }))

  return (
    <section className="how-it-works" id="how-it-works">
      <div className="section-label">
        <span className="label-glow" />
        {t('how_it_works.label')}
      </div>
      <h2 className="section-title">{t('how_it_works.title')}</h2>
      <p className="section-subtitle">{t('how_it_works.subtitle')}</p>
      <div className="hiw-grid">
        {steps.map(s => (
          <div key={s.n} className="hiw-card">
            <div className="hiw-step-num">{String(s.n).padStart(2, '0')}</div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
