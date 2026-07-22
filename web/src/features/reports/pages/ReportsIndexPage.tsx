import { Link } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { PageHeader } from '@/components/PageHeader';
import {
  CardIcon,
  ChartIcon,
  PackageIcon,
  ReceiptIcon,
  UsersIcon,
} from '@/components/icons';
import { useMe } from '@/features/auth/api';

// Reports landing — role-shaped tile grid pointing at each dedicated
// report screen. Every tile carries a one-line hint so a hurried
// owner or shop clerk lands on the right page in one tap. Roles map:
//   * OWNER — every report
//   * SHOP — shop / sales / debt / estimated-profit (money-side only)
//   * WAREHOUSE — warehouse / incoming-orders (stock-side only)

type Tile = {
  to: string;
  title: string;
  hint: string;
  Icon: (p: { size?: number }) => ReactElement;
  allowed: readonly Role[];
};

function tiles(t: (k: string) => string): readonly Tile[] {
  return [
    {
      to: '/reports/shop',
      title: t('reports.index.shop.title'),
      hint: t('reports.index.shop.hint'),
      Icon: ChartIcon,
      allowed: [Role.OWNER, Role.SHOP],
    },
    {
      to: '/reports/sales',
      title: t('reports.index.sales.title'),
      hint: t('reports.index.sales.hint'),
      Icon: ReceiptIcon,
      allowed: [Role.OWNER, Role.SHOP],
    },
    {
      to: '/reports/debt',
      title: t('reports.index.debt.title'),
      hint: t('reports.index.debt.hint'),
      Icon: UsersIcon,
      allowed: [Role.OWNER, Role.SHOP],
    },
    {
      to: '/reports/estimated-profit',
      title: t('reports.index.profit.title'),
      hint: t('reports.index.profit.hint'),
      Icon: CardIcon,
      allowed: [Role.OWNER, Role.SHOP],
    },
    {
      to: '/reports/warehouse',
      title: t('reports.index.warehouse.title'),
      hint: t('reports.index.warehouse.hint'),
      Icon: PackageIcon,
      allowed: [Role.OWNER, Role.WAREHOUSE],
    },
    {
      to: '/reports/incoming-orders',
      title: t('reports.index.incomingOrders.title'),
      hint: t('reports.index.incomingOrders.hint'),
      Icon: PackageIcon,
      allowed: [Role.OWNER, Role.WAREHOUSE],
    },
  ] as const;
}

export default function ReportsIndexPage() {
  const { t } = useTranslation();
  const me = useMe();
  const role = me.data?.user.role;
  if (!role) return null;
  const items = tiles(t).filter((tile) => tile.allowed.includes(role));

  return (
    <div>
      <PageHeader
        title={t('reports.index.title')}
        subtitle={t('reports.index.subtitle')}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-start shadow-[0_1px_2px_rgba(24,25,40,0.04)] transition-colors hover:border-brand hover:bg-tint/30"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
              <tile.Icon size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[15.5px] font-semibold text-ink">
                {tile.title}
              </div>
              <div className="mt-1 text-[13px] text-muted">{tile.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
