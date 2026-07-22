import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import type { Language } from '@/i18n';

type Props = {
  /** 'onBrand' inverts the palette so the switcher reads on the indigo header. */
  variant?: 'default' | 'onBrand';
};

export function LanguageSwitcher({ variant = 'default' }: Props) {
  const { i18n, t } = useTranslation();
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'fr';

  const cls =
    variant === 'onBrand'
      ? 'rounded-input border border-white/20 bg-white/10 px-2 py-1 text-[13px] font-semibold text-white focus:outline focus:outline-2 focus:outline-white/40'
      : 'rounded-input border border-[#C8C9D4] bg-surface px-2 py-1 text-[13px] font-semibold text-ink focus:outline focus:outline-2 focus:outline-brand';

  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className={cls}
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
