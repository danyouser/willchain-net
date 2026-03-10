import { useTranslation } from 'react-i18next'

export function ServiceTiers() {
  const { t } = useTranslation()

  const tiers = [
    { nameKey: 'tiers.basic_name',  threshold: '1,000',   featured: false, featureKeys: ['tiers.basic_f1','tiers.basic_f2','tiers.basic_f3','tiers.basic_f4'] },
    { nameKey: 'tiers.family_name', threshold: '10,000',  featured: true,  featureKeys: ['tiers.family_f1','tiers.family_f2','tiers.family_f3','tiers.family_f4'] },
    { nameKey: 'tiers.legacy_name', threshold: '100,000', featured: false, featureKeys: ['tiers.legacy_f1','tiers.legacy_f2','tiers.legacy_f3','tiers.legacy_f4'] },
  ]

  return (
    <section className="problem-section" id="tiers">
      <div className="section-label">
        <span className="label-glow" />
        {t('tiers.title')}
      </div>
      <h2 className="section-title">{t('tiers.title')}</h2>
      <p className="section-subtitle">{t('tiers.subtitle')}</p>
      <div className="problem-cards">
        {tiers.map(tier => (
          <div key={tier.nameKey} className={`problem-card${tier.featured ? ' card-span-1' : ''}`}
            style={tier.featured ? { border: '1px solid var(--bb)', boxShadow: 'var(--sg)' } : {}}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>{t(tier.nameKey)}</h3>
            <div style={{ color: 'var(--blue-l)', fontWeight: 700, fontSize: '1.4rem', marginBottom: '16px' }}>
              {tier.threshold}+ <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{t('tiers.will_suffix')}</span>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tier.featureKeys.map(k => (
                <li key={k} style={{ display: 'flex', gap: '8px', fontSize: '0.85rem', color: 'var(--t2)' }}>
                  <span style={{ color: 'var(--green)', flexShrink: 0 }}>✓</span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
