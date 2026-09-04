import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'

export const supportedLanguages = ['en', 'zh-TW'] as const

export type SupportedLanguage = (typeof supportedLanguages)[number]

const languageStorageKey = 'kumiko.language'

export const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
} as const

export const languageNames: Record<SupportedLanguage, string> = {
  en: resources.en.translation.settings.languageName,
  'zh-TW': resources['zh-TW'].translation.settings.languageName,
}

const normalizeLanguage = (language: string | null | undefined) => {
  if (!language) {
    return 'zh-TW'
  }

  const normalized = language.toLowerCase()
  if (normalized.startsWith('zh')) {
    return 'zh-TW'
  }
  if (normalized.startsWith('en')) {
    return 'en'
  }
  return 'zh-TW'
}

const getInitialLanguage = () => {
  if (typeof window === 'undefined') {
    return 'zh-TW'
  }

  return normalizeLanguage(
    window.localStorage.getItem(languageStorageKey) ?? window.navigator.language
  )
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'zh-TW',
  interpolation: {
    escapeValue: false,
  },
})

i18n.on('languageChanged', (language) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(languageStorageKey, normalizeLanguage(language))
})

export default i18n
