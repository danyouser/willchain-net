import { lazy, Suspense } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { RainbowKitProvider, darkTheme, type Locale } from '@rainbow-me/rainbowkit'
import { CustomAvatar } from './components/CustomAvatar'
import { DisclaimerProvider } from './context/DisclaimerContext'
import { NotificationProvider } from './context/NotificationContext'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationModal } from './components/modals/NotificationModal'

// Map app languages → RainbowKit locale codes
const rainbowKitLocale: Record<string, Locale> = {
  en: 'en-US', es: 'es-419', pt: 'pt-BR', ru: 'ru-RU',
  de: 'de-DE', fr: 'fr-FR', tr: 'tr-TR', uk: 'uk-UA',
}

const rainbowTheme = darkTheme({
  accentColor: '#ff6400',
  accentColorForeground: 'white',
  borderRadius: 'medium',
})

// Lazy-loaded: dashboard and landing sections are mutually exclusive paths
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const HeroSection = lazy(() => import('./components/sections/HeroSection').then(m => ({ default: m.HeroSection })))
const AboutSection = lazy(() => import('./components/sections/AboutSection').then(m => ({ default: m.AboutSection })))
const HowItWorks = lazy(() => import('./components/sections/HowItWorks').then(m => ({ default: m.HowItWorks })))
const DemoSection = lazy(() => import('./components/sections/DemoSection').then(m => ({ default: m.DemoSection })))
const CreditsSection = lazy(() => import('./components/sections/CreditsSection').then(m => ({ default: m.CreditsSection })))
const FAQSection = lazy(() => import('./components/sections/FAQSection').then(m => ({ default: m.FAQSection })))
const DisclaimerSection = lazy(() => import('./components/sections/DisclaimerSection').then(m => ({ default: m.DisclaimerSection })))
const DisclaimerModal = lazy(() => import('./components/modals/DisclaimerModal').then(m => ({ default: m.DisclaimerModal })))
const TgLinkModal = lazy(() => import('./components/modals/TgLinkModal').then(m => ({ default: m.TgLinkModal })))

function AppContent() {
  const { isConnected } = useAccount()

  return (
    <div className="app">
      <Header />
      <Suspense fallback={null}>
        {isConnected ? (
          <ErrorBoundary>
            <Dashboard />
          </ErrorBoundary>
        ) : (
          <>
            <HeroSection />
            <AboutSection />
            <HowItWorks />
            <DemoSection />
            <CreditsSection />
            <FAQSection />
            <DisclaimerSection />
          </>
        )}
      </Suspense>
      <Footer />
      <Suspense fallback={null}>
        <DisclaimerModal />
      </Suspense>
      <NotificationModal />
      <Suspense fallback={null}>
        <TgLinkModal />
      </Suspense>
    </div>
  )
}

function App() {
  const { i18n } = useTranslation()
  const locale = rainbowKitLocale[i18n.language] ?? 'en-US'

  return (
    <RainbowKitProvider avatar={CustomAvatar} theme={rainbowTheme} locale={locale}>
      <DisclaimerProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </DisclaimerProvider>
    </RainbowKitProvider>
  )
}

export default App
