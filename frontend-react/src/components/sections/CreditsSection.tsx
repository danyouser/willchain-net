import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

export function CreditsSection() {
  const { t } = useTranslation()

  const stats = [
    { valueKey: 'credits.opensource_value', titleKey: 'credits.opensource_title' },
    { valueKey: 'credits.audit_value', titleKey: 'credits.audit_title' },
    { valueKey: 'credits.tests_value', titleKey: 'credits.tests_title' },
    { valueKey: 'credits.network_value', titleKey: 'credits.network_title' },
  ]

  return (
    <section className="credits-section" id="credits">
      <div className="credits-strip">
        <img
          src="/assets/credits-bg.webp"
          alt=""
          className="credits-strip-bg"
          loading="lazy"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        {stats.map((s, i) => (
          <Fragment key={s.valueKey}>
            <div className="credits-stat">
              <div className="credits-stat-value">{t(s.valueKey)}</div>
              <div className="credits-stat-label">{t(s.titleKey)}</div>
            </div>
            {i < stats.length - 1 && <div className="credits-divider" />}
          </Fragment>
        ))}
      </div>
    </section>
  )
}
