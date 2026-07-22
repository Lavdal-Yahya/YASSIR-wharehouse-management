import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { Input } from '@/components/Input';
import { useMe } from '@/features/auth/api';
import { useShopsList } from '@/features/shops/api';
import type { ReportFilter } from '../types';

// Shared filter strip for every report page. SHOP users don't see the
// shop dropdown — their scope is fixed by the server anyway. OWNER
// gets an "all shops" option so cross-shop aggregates are one click
// away.
//
// Kept minimal on purpose (phase-7 §5): the three fields the phase
// doc calls out (shopId, from, to). Preset ranges like "today / this
// week / this month" belong on the dashboards where quick answers
// matter more; the reports pass raw dates through.

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
    <div className="mb-4 grid gap-3 md:grid-cols-4">
      {!isShop && !hideShop ? (
        <div className="flex flex-col gap-1 text-start">
          <label className="text-sm font-medium text-slate-700">
            {t('reports.filter.shop')}
          </label>
          <select
            value={value.shopId ?? ''}
            onChange={(e) =>
              onChange({ ...value, shopId: e.target.value || undefined })
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
