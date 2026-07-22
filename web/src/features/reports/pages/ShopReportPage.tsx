import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { BalanceBar } from '@/components/BalanceBar';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { StatCard } from '../components/StatCard';
import { useShopReport } from '../api';
import type { ReportFilter } from '../types';

// P7-04 · Shop report — the marquee report. Repeats the dashboard's
// BalanceBar as the visual anchor, then breaks the money quantities
// out as tiles so an owner can read them one at a time. Filters
// (shop, date range) sit on top and refresh every tile.

export default function ShopReportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReportFilter>({});
  const q = useShopReport(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.shop.title')}
        subtitle={t('reports.shop.subtitle')}
      />
      <ReportFilters value={filter} onChange={setFilter} />

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
          <Spinner /> {t('loading')}
        </div>
      ) : q.error ? (
        <p
          role="alert"
          className="rounded-input bg-debt-bg p-3 text-[14px] font-medium text-debt-fg"
        >
          {errorMessage(q.error, t)}
        </p>
      ) : q.data ? (
        <>
          <SectionCard elevated className="mb-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
                {t('reports.shop.salesValue')}
              </span>
              <Money value={q.data.salesValue} size="xl" />
            </div>
            <div className="mt-3">
              <BalanceBar
                collected={q.data.totalCollected}
                outstanding={q.data.outstanding}
                collectedLabel={t('reports.shop.totalCollected')}
                outstandingLabel={t('reports.shop.outstanding')}
              />
            </div>
          </SectionCard>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t('reports.shop.cashAtSale')}
              money={q.data.cashAtSale}
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.laterPayments')}
              money={q.data.laterPayments}
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.totalCollected')}
              money={q.data.totalCollected}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.newDebt')}
              money={q.data.newDebt}
              tone="debt"
            />
            <StatCard
              label={t('reports.shop.outstanding')}
              money={q.data.outstanding}
              dominant
              tone="debt"
            />
            <StatCard
              label={t('reports.shop.netCollected')}
              money={q.data.netCollected}
              hint={t('reports.shop.netCollectedHint')}
            />
            <StatCard
              label={t('reports.shop.expenses')}
              money={q.data.expenses}
              tone="muted"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
