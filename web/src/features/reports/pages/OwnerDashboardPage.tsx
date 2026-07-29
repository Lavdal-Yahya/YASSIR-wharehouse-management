import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { BalanceBar } from '@/components/BalanceBar';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import {
  useIncomingOrdersReport,
  useSalesReport,
  useShopReport,
  useWarehouseReport,
} from '../api';
import { useStockValue } from '@/features/inventory/api';
import { StatCard } from '../components/StatCard';

// P7-10 · Owner dashboard, ledger-designed. The design's signature
// element (BalanceBar) leads the headline card — one glance answers
// "sold vs collected vs debt". Three headline StatCards below give
// the three figures as separate numbers per phase-7 §7 item 1.
// Ops tiles + per-shop grid round it out.

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

  const todayFilter = { from: today, to: today };
  const todayReport = useShopReport(todayFilter);
  const salesToday = useSalesReport(todayFilter);
  const allTime = useShopReport({});
  const warehouse = useWarehouseReport({});
  const orders = useIncomingOrdersReport({});
  const stockValue = useStockValue();

  const pendingOrdersCount =
    orders.data?.byStatus.reduce((n, s) => {
      if (
        s.status === 'ORDERED' ||
        s.status === 'SHIPPED' ||
        s.status === 'PARTIALLY_RECEIVED'
      ) {
        return n + s.ordersCount;
      }
      return n;
    }, 0) ?? 0;

  const lowOrOut =
    (warehouse.data?.lowStockCount ?? 0) +
    (warehouse.data?.outOfStockCount ?? 0);

  const isLoading =
    todayReport.isLoading || salesToday.isLoading || allTime.isLoading;
  const err = todayReport.error ?? salesToday.error ?? allTime.error;

  return (
    <div>
      <PageHeader
        title={t('dashboard.owner.title')}
        subtitle={t('dashboard.owner.subtitle')}
      />

      {isLoading ? (
        <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
          <Spinner /> {t('loading')}
        </div>
      ) : err ? (
        <p
          role="alert"
          className="rounded-input bg-debt-bg px-3 py-2 text-[14px] font-medium text-debt-fg"
        >
          {errorMessage(err, t)}
        </p>
      ) : (
        <>
          {/* Headline card — total sold with the BalanceBar underneath.
              This is the dashboard's protagonist per the design brief:
              the two-tone bar makes the sold-vs-collected-vs-debt
              distinction pre-attentive. */}
          <SectionCard elevated className="mb-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
                {t('dashboard.owner.today')} · {t('reports.shop.salesValue')}
              </span>
              <Money
                value={todayReport.data?.salesValue ?? 0}
                size="xl"
                className="text-ink"
              />
            </div>
            <div className="mt-3">
              <BalanceBar
                collected={todayReport.data?.totalCollected ?? 0}
                outstanding={todayReport.data?.newDebt ?? 0}
                collectedLabel={t('reports.shop.totalCollected')}
                outstandingLabel={t('reports.shop.newDebt')}
              />
            </div>
          </SectionCard>

          {/* Three-figure spine — repeats the numbers as distinct StatCards
              so an owner reading top-to-bottom still gets them clean. */}
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
            {t('dashboard.owner.today')}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t('reports.shop.salesValue')}
              money={todayReport.data?.salesValue ?? 0}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.totalCollected')}
              money={todayReport.data?.totalCollected ?? 0}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.newDebt')}
              money={todayReport.data?.newDebt ?? 0}
              dominant
              tone="debt"
            />
          </div>

          {/* Ops tiles — always-visible outstanding + counts that need
              action. Low-stock and pending-orders click through to the
              screens that resolve them. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t('dashboard.owner.totalOutstanding')}
              money={allTime.data?.outstanding ?? 0}
              tone="debt"
            />
            <StatCard
              label={t('dashboard.owner.lowStockCount')}
              value={lowOrOut}
              hint={
                <Link to="/warehouse" className="text-brand hover:underline">
                  {t('nav.warehouse')} →
                </Link>
              }
              tone={lowOrOut > 0 ? 'debt' : 'muted'}
            />
            <StatCard
              label={t('dashboard.owner.pendingOrdersCount')}
              value={pendingOrdersCount}
              hint={
                <Link to="/orders" className="text-brand hover:underline">
                  {t('nav.orders')} →
                </Link>
              }
              tone={pendingOrdersCount > 0 ? 'debt' : 'muted'}
            />
          </div>

          {/* Stock-value spine — total plus warehouse/shop split.
              Uses purchase cost × on-hand quantity across every
              location the user can see. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t('dashboard.owner.totalStockValue')}
              money={stockValue.data?.totalValue ?? 0}
              hint={t('dashboard.owner.totalStockValueHint')}
              tone="positive"
              dominant
            />
            <StatCard
              label={t('dashboard.owner.warehouseStockValue')}
              money={stockValue.data?.warehouseValue ?? 0}
            />
            <StatCard
              label={t('dashboard.owner.shopsStockValue')}
              money={stockValue.data?.shopsValue ?? 0}
            />
          </div>

          {salesToday.data && salesToday.data.byShop.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-[15.5px] font-semibold text-ink text-start">
                {t('dashboard.owner.perShop')}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {salesToday.data.byShop.map((s) => (
                  <SectionCard key={s.shopId}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-ink">
                        {s.shopName}
                      </span>
                      <span className="text-[12px] font-medium text-muted tabular-nums">
                        {t('dashboard.owner.perShopCount', {
                          count: s.salesCount,
                        })}
                      </span>
                    </div>
                    <div className="mt-3">
                      <BalanceBar
                        collected={s.cashAtSale}
                        outstanding={s.salesValue - s.cashAtSale}
                        collectedLabel={t('reports.shop.cashAtSale')}
                        outstandingLabel={t('reports.shop.newDebt')}
                        size="sm"
                      />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-2">
                      <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
                        {t('reports.shop.salesValue')}
                      </span>
                      <Money value={s.salesValue} size="md" />
                    </div>
                  </SectionCard>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
