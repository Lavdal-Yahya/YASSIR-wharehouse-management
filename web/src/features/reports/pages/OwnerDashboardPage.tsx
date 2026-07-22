import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatMoney } from '@/shared/money';
import { errorMessage } from '@/shared/error-message';
import {
  useIncomingOrdersReport,
  useSalesReport,
  useShopReport,
  useWarehouseReport,
} from '../api';
import { StatCard } from '../components/StatCard';

// P7-10 · Owner dashboard. Numbers-first (spec §9, design brief
// §4.3) — no decorative charts. The three headline figures are the
// spec §22 distinction: today's sales value / cash collected / new
// debt as three separate cards. Outstanding is the always-visible
// debt total. Low-stock and pending-order counts round out the
// operational tiles; the per-shop grid uses the sales report's
// byShop slice to save a round-trip per shop.

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function OwnerDashboardPage() {
  const { t } = useTranslation();
  const today = useMemo(() => todayIso(), []);

  // Today across all shops (owner sees the composite).
  const todayFilter = { from: today, to: today };
  const todayReport = useShopReport(todayFilter);
  const salesToday = useSalesReport(todayFilter);
  // Outstanding is as-of — no date bounds → "outstanding right now".
  const allTime = useShopReport({});
  const warehouse = useWarehouseReport({});
  const orders = useIncomingOrdersReport({});

  const pendingOrdersCount =
    orders.data?.byStatus.reduce((n, s) => {
      // Not-yet-fully-received orders: ORDERED, SHIPPED, PARTIALLY_RECEIVED.
      if (s.status === 'ORDERED' || s.status === 'SHIPPED' || s.status === 'PARTIALLY_RECEIVED') {
        return n + s.ordersCount;
      }
      return n;
    }, 0) ?? 0;

  const lowOrOut =
    (warehouse.data?.lowStockCount ?? 0) + (warehouse.data?.outOfStockCount ?? 0);

  return (
    <div>
      <PageHeader
        title={t('dashboard.owner.title')}
        subtitle={t('dashboard.owner.subtitle')}
      />

      {todayReport.isLoading || salesToday.isLoading || allTime.isLoading ? (
        <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
          <Spinner /> {t('loading')}
        </div>
      ) : todayReport.error || salesToday.error || allTime.error ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage(
            todayReport.error ?? salesToday.error ?? allTime.error,
            t,
          )}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
            {t('dashboard.owner.today')}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label={t('reports.shop.salesValue')}
              value={formatMoney(todayReport.data?.salesValue ?? 0)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.totalCollected')}
              value={formatMoney(todayReport.data?.totalCollected ?? 0)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.newDebt')}
              value={formatMoney(todayReport.data?.newDebt ?? 0)}
              dominant
              tone="debt"
            />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <StatCard
              label={t('dashboard.owner.totalOutstanding')}
              value={formatMoney(allTime.data?.outstanding ?? 0)}
              tone="debt"
            />
            <StatCard
              label={t('dashboard.owner.lowStockCount')}
              value={lowOrOut}
              hint={
                <Link to="/warehouse" className="hover:underline">
                  {t('nav.warehouse')} →
                </Link>
              }
              tone={lowOrOut > 0 ? 'debt' : 'muted'}
            />
            <StatCard
              label={t('dashboard.owner.pendingOrdersCount')}
              value={pendingOrdersCount}
              hint={
                <Link to="/orders" className="hover:underline">
                  {t('nav.orders')} →
                </Link>
              }
              tone={pendingOrdersCount > 0 ? 'debt' : 'muted'}
            />
          </div>

          {salesToday.data && salesToday.data.byShop.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 text-start">
                {t('dashboard.owner.perShop')}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {salesToday.data.byShop.map((s) => (
                  <div
                    key={s.shopId}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-start"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {s.shopName}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {t('dashboard.owner.perShopCount', { count: s.salesCount })}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <div className="uppercase tracking-wide text-slate-400">
                          {t('reports.shop.salesValue')}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 tabular-nums">
                          {formatMoney(s.salesValue)}
                        </div>
                      </div>
                      <div>
                        <div className="uppercase tracking-wide text-slate-400">
                          {t('reports.shop.cashAtSale')}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 tabular-nums">
                          {formatMoney(s.cashAtSale)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
