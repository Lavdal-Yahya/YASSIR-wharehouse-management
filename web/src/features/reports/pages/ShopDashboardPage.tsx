import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/Button';
import { formatMoney } from '@/shared/money';
import { errorMessage } from '@/shared/error-message';
import { useShopReport } from '../api';
import { StatCard } from '../components/StatCard';

// P7-11 · Shop-employee dashboard. Same numbers-first shape as the
// owner dashboard but scoped to the shop — the server forces
// shopId to assignedShopId regardless of any query the client sends
// (resolveReportScope + ShopScopeGuard). Adds a quick-actions
// section pointing at the shop stock page, customers list, and
// expenses page (all shop-role reachable).

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ShopDashboardPage() {
  const { t } = useTranslation();
  const today = useMemo(() => todayIso(), []);
  const todayReport = useShopReport({ from: today, to: today });
  // All-time outstanding for the shop (scope is server-forced).
  const allTime = useShopReport({});

  const loading = todayReport.isLoading || allTime.isLoading;
  const err = todayReport.error ?? allTime.error;

  return (
    <div>
      <PageHeader
        title={t('dashboard.shop.title')}
        subtitle={t('dashboard.shop.subtitle')}
      />

      {loading ? (
        <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
          <Spinner /> {t('loading')}
        </div>
      ) : err ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage(err, t)}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
            {t('dashboard.owner.today')}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label={t('dashboard.shop.todaySalesValue')}
              value={formatMoney(todayReport.data?.salesValue ?? 0)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('dashboard.shop.todayCash')}
              value={formatMoney(todayReport.data?.totalCollected ?? 0)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('dashboard.shop.todayDebt')}
              value={formatMoney(todayReport.data?.newDebt ?? 0)}
              dominant
              tone="debt"
            />
          </div>

          <div className="mt-6">
            <StatCard
              label={t('dashboard.shop.myOutstanding')}
              value={formatMoney(allTime.data?.outstanding ?? 0)}
              tone="debt"
            />
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-800 text-start">
              {t('dashboard.shop.quickActions')}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link to="/shop/stock">
                <Button variant="secondary">
                  {t('dashboard.shop.openStock')}
                </Button>
              </Link>
              <Link to="/customers">
                <Button variant="secondary">
                  {t('dashboard.shop.openCustomers')}
                </Button>
              </Link>
              <Link to="/expenses">
                <Button variant="secondary">
                  {t('dashboard.shop.openExpenses')}
                </Button>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
