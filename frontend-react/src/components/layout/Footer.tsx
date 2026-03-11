import { useTranslation } from 'react-i18next'
import { useAccount } from 'wagmi'

export function Footer() {
  const { t } = useTranslation()
  const { isConnected } = useAccount()

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-content">
          <div className="footer-left">
            <a href="/" className="footer-logo">
              <img src="/assets/logo.svg" alt="WillChain" className="footer-logo-img" />
              <span className="logo-text">WillChain</span>
            </a>
            <div className="footer-links">
              {!isConnected && <a href="#disclaimer">{t('footer.legal')}</a>}
              <a href="https://sepolia.basescan.org/address/0x6fAd1475B41731E3eDA21998417Cb2e18E795877#code" target="_blank" rel="noopener noreferrer">
                {t('footer.contract')}
              </a>
              <a href="https://t.me/WillChainBot" target="_blank" rel="noopener noreferrer">
                {t('footer.bot')}
              </a>
            </div>
          </div>
          <p className="footer-copyright">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  )
}
