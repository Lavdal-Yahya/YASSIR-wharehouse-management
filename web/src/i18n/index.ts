import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr/common.json';
import ar from './ar/common.json';

export const SUPPORTED_LANGUAGES = ['fr', 'ar'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
const STORAGE_KEY = 'lang';

function initialLanguage(): Language {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === 'fr' || stored === 'ar') return stored;
  const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'fr';
  return browser === 'ar' ? 'ar' : 'fr';
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { common: fr },
    ar: { common: ar },
  },
  lng: initialLanguage(),
  fallbackLng: 'fr',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyDirection(lng: string): void {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
  document.documentElement.dir = dir;
}

applyDirection(i18n.language);

i18n.on('languageChanged', (lng) => {
  applyDirection(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Storage disabled — direction still applies, choice just isn't persisted.
  }
});

export default i18n;
