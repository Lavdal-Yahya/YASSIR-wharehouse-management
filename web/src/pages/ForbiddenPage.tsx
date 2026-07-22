import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">{t('forbidden.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('forbidden.message')}</p>
    </section>
  );
}

export default ForbiddenPage;
