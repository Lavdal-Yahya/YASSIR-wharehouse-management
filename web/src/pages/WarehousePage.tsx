import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

export default function WarehousePage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('nav.warehouse')} description={t('placeholder.warehouse')} />;
}
