import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { Input } from '@/components/Input';
import { useMe } from '@/features/auth/api';
import { useShopsList } from '@/features/shops/api';
import type { ReportFilter } from '../types';

// Shared filter strip for every report page. SHOP users don't see the
// shop dropdown (their scope is server-forced). OWNER gets an "all
// shops" option so cross-shop aggregates are one click away.

export function ReportFilters({
  value,
  onChange,
  hideShop = false,
}: {
  value: ReportFilter;
  onChange: (next: ReportFilter) => void;
  hideShop?: boolean;
}) {
  const { t } = useTranslation();
  const me = useMe();
  const isShop = me.data?.user.role === Role.SHOP;
  const shops = useShopsList({ page: 1, pageSize: 100 });

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {!isShop && !hideShop ? (
        <div className="flex flex-col gap-1.5 text-start">
          <label className="text-[14px] font-semibold text-ink">
            {t('reports.filter.shop')}
          </label>
          <select
            value={value.shopId ?? ''}
            onChange={(e) =>
              onChange({ ...value, shopId: e.target.value || undefined })
            }
            className="h-[50px] rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-[15px] text-ink focus:outline focus:outline-2 focus:outline-brand"
          >
            <option value="">{t('reports.filter.allShops')}</option>
            {shops.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Input
        type="date"
        label={t('reports.filter.from')}
        value={value.from ?? ''}
        onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
      />
      <Input
        type="date"
        label={t('reports.filter.to')}
        value={value.to ?? ''}
        onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
      />
    </div>
  );
}
