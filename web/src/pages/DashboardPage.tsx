import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

export default function DashboardPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('nav.dashboard')} description={t('placeholder.dashboard')} />;
}
