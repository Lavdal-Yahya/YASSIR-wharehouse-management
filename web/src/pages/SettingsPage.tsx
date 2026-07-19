import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

export default function SettingsPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('nav.settings')} description={t('placeholder.settings')} />;
}
