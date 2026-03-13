import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export function FAQSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const answerRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const toggle = useCallback((n: number) => {
    setOpen(prev => prev === n ? null : n)
  }, [])

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
          {faqs.map(faq => {
            const isOpen = open === faq.n
            return (
              <div
                key={faq.n}
                className={`faq-item${isOpen ? ' faq-open' : ''}`}
                onClick={() => toggle(faq.n)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(faq.n) } }}
              >
                <div className="faq-summary">
                  <span className="faq-num">{String(faq.n).padStart(2, '0')}</span>
                  <span className="faq-question">{faq.question}</span>
                  <span className="faq-toggle" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <line x1="9" y1="3" x2="9" y2="15" className="faq-toggle-v" />
                      <line x1="3" y1="9" x2="15" y2="9" />
                    </svg>
                  </span>
                </div>
                <div
                  className="faq-answer-wrap"
                  ref={el => { answerRefs.current[faq.n] = el }}
                  style={{ maxHeight: isOpen ? (answerRefs.current[faq.n]?.scrollHeight ?? 500) + 'px' : '0px' }}
                >
                  <div className="faq-answer">{faq.answer}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
