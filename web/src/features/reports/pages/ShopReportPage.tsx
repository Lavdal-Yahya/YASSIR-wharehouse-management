import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatMoney } from '@/shared/money';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { StatCard } from '../components/StatCard';
import { useShopReport } from '../api';
import type { ReportFilter } from '../types';

// P7-04 · Shop report page. The three headline numbers (sales value,
// total collected, outstanding) are laid out as `dominant` StatCards
// so they're visibly distinct at a glance — phase-7 §7 item 1's DoD.
// Second row breaks down cash into "at sale" + "later" plus new debt
// and net collected (after expenses).

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
        <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
          <Spinner /> {t('loading')}
        </div>
      ) : q.error ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage(q.error, t)}
        </p>
      ) : q.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label={t('reports.shop.salesValue')}
              value={formatMoney(q.data.salesValue)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.totalCollected')}
              value={formatMoney(q.data.totalCollected)}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.shop.outstanding')}
              value={formatMoney(q.data.outstanding)}
              dominant
              tone="debt"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <StatCard
              label={t('reports.shop.cashAtSale')}
              value={formatMoney(q.data.cashAtSale)}
            />
            <StatCard
              label={t('reports.shop.laterPayments')}
              value={formatMoney(q.data.laterPayments)}
            />
            <StatCard
              label={t('reports.shop.newDebt')}
              value={formatMoney(q.data.newDebt)}
              tone="debt"
            />
            <StatCard
              label={t('reports.shop.netCollected')}
              value={formatMoney(q.data.netCollected)}
              hint={t('reports.shop.netCollectedHint')}
            />
          </div>
          <div className="mt-3">
            <StatCard
              label={t('reports.shop.expenses')}
              value={formatMoney(q.data.expenses)}
              tone="muted"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
