import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDisclaimer } from '../../context/DisclaimerContext'
import { useModalA11y } from '../../hooks/useModalA11y'

export function DisclaimerModal() {
  const { showModal, acceptDisclaimer, declineDisclaimer } = useDisclaimer()
  const [accepted, setAccepted] = useState(false)
  const { t } = useTranslation()
  const modalRef = useModalA11y(showModal, declineDisclaimer)

  if (!showModal) return null

  return (
    <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="disclaimer-modal-title">
      <div className="modal-overlay" onClick={declineDisclaimer} aria-hidden="true" />
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="disclaimer-modal-title">{t('disclaimer.title')}</h2>
          <p className="modal-subtitle">{t('disclaimer.modal_subtitle')}</p>
        </div>
        <div className="modal-body">
          <div className="disclaimer-section">
            <h4>{t('disclaimer.s1_title')}</h4>
            <p>{t('disclaimer.s1_text')}</p>
          </div>
          <div className="disclaimer-section">
            <h4>{t('disclaimer.s2_title')}</h4>
            <p>{t('disclaimer.s2_text')}</p>
          </div>
          <div className="disclaimer-section">
            <h4>{t('disclaimer.s3_title')}</h4>
            <p>{t('disclaimer.s3_text')}</p>
          </div>
          <div className="disclaimer-section">
            <h4>{t('disclaimer.s4_title')}</h4>
            <p>{t('disclaimer.s4_text')}</p>
          </div>
          <div className="disclaimer-section">
            <h4>{t('disclaimer.s5_title')}</h4>
            <p>{t('disclaimer.s5_text')}</p>
          </div>
        </div>
        <div className="modal-footer">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>{t('disclaimer.checkbox')}</span>
          </label>
          <div className="modal-buttons">
            <button className="btn btn-secondary" onClick={declineDisclaimer}>
              {t('disclaimer.decline_btn')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!accepted}
              onClick={acceptDisclaimer}
            >
              {t('disclaimer.accept_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
