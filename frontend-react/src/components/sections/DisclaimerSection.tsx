import { useTranslation } from 'react-i18next'

export function DisclaimerSection() {
  const { t } = useTranslation()

  const items = [1, 2, 3, 4, 5].map(n => ({
    title: t(`disclaimer.s${n}_title`),
    text:  t(`disclaimer.s${n}_text`),
  }))

  return (
    <section id="disclaimer" className="disclaimer-section-page">
      <h2>{t('disclaimer.title')}</h2>
      <div className="disclaimer-content">
        {items.map((item, i) => (
          <div key={i} className="disclaimer-item">
            <h4>{item.title}</h4>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
