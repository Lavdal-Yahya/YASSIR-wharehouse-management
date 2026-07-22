import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import type { Language } from '@/i18n';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'fr';

  return (
    <label className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="rounded-input border border-white/20 bg-white/10 px-2 py-1 text-[13px] font-semibold text-white focus:outline focus:outline-2 focus:outline-white/40"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng} className="text-ink">
            {t(`language.${lng}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
