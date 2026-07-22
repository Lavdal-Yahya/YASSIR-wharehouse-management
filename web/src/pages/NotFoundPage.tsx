import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4"
      >
        {t('notFound.back')}
      </Link>
    </section>
  );
}
