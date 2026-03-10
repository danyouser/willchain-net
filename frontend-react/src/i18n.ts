import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'ru', 'de', 'fr', 'tr', 'uk', 'pl', 'it', 'nl'] as const
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'willchain_language',
    },
    interpolation: {
      escapeValue: false, // React handles XSS
    },
  })

export default i18n
