import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

export default function ShopPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('nav.shop')} description={t('placeholder.shop')} />;
}
