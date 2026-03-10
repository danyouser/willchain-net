import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function FAQSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)

  const faqs = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    n,
    question: t(`faq.q${n}`),
    answer:   t(`faq.a${n}`),
  }))

  return (
    <section className="faq" id="faq">
      <div className="faq-inner">
        <div className="section-label" style={{ margin: '0 auto 18px' }}>
          <span className="label-glow" />
          {t('faq.label')}
        </div>
        <h2 className="section-title">{t('faq.title')}</h2>
        <p className="section-subtitle">{t('faq.subtitle')}</p>
        <div className="faq-list">
          {faqs.map(faq => (
            <details
              key={faq.n}
              className="faq-item"
              open={open === faq.n}
              onClick={e => { e.preventDefault(); setOpen(open === faq.n ? null : faq.n) }}
            >
              <summary>{faq.question}</summary>
              <div className="faq-answer">{faq.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
