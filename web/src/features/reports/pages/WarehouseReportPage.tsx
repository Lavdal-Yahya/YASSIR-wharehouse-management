import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { StatCard } from '../components/StatCard';
import { useWarehouseReport } from '../api';
import type { ReportFilter } from '../types';

// Warehouse report screen (P7-05 UI). As-of numbers (current stock,
// distinct products, low/out-of-stock counts) and window-bound flows
// (received via order + direct receipt, transferred out, corrections
// up/down). The service does the split; this page just renders it.

export default function WarehouseReportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Omit<ReportFilter, 'shopId'>>({});
  const q = useWarehouseReport(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.warehouse.title')}
        subtitle={t('reports.warehouse.subtitle')}
      />
      <ReportFilters value={filter} onChange={setFilter} hideShop />

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
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
            {t('reports.warehouse.asOfSection')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('reports.warehouse.currentStock')}
              value={q.data.currentStock}
              dominant
              tone="positive"
            />
            <StatCard
              label={t('reports.warehouse.distinctProducts')}
              value={q.data.distinctProducts}
            />
            <StatCard
              label={t('reports.warehouse.lowStockCount')}
              value={q.data.lowStockCount}
              tone={q.data.lowStockCount > 0 ? 'debt' : 'muted'}
            />
            <StatCard
              label={t('reports.warehouse.outOfStockCount')}
              value={q.data.outOfStockCount}
              tone={q.data.outOfStockCount > 0 ? 'debt' : 'muted'}
            />
          </div>

          <p className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">
            {t('reports.warehouse.flowsSection')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SectionCard title={t('reports.warehouse.received')}>
              <div className="flex flex-col gap-2 text-[14px]">
                <Row
                  label={t('reports.warehouse.orderReceipts')}
                  value={q.data.received.orderReceipts}
                />
                <Row
                  label={t('reports.warehouse.directReceipts')}
                  value={q.data.received.directReceipts}
                />
                <div className="mt-1 border-t border-line-soft pt-2">
                  <Row
                    label={t('reports.warehouse.receivedTotal')}
                    value={q.data.received.total}
                    strong
                  />
                </div>
              </div>
            </SectionCard>

            <StatCard
              label={t('reports.warehouse.transferredOut')}
              value={q.data.transferredOut}
            />

            <SectionCard title={t('reports.warehouse.corrections')}>
              <div className="flex flex-col gap-2 text-[14px]">
                <Row
                  label={t('reports.warehouse.correctionsUp')}
                  value={q.data.corrections.up}
                  positive
                />
                <Row
                  label={t('reports.warehouse.correctionsDown')}
                  value={-q.data.corrections.down}
                  negative
                />
                <div className="mt-1 border-t border-line-soft pt-2">
                  <Row
                    label={t('reports.warehouse.correctionsNet')}
                    value={q.data.corrections.net}
                    strong
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  positive = false,
  negative = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13.5px] text-muted">{label}</span>
      <span
        className={
          'tabular-nums ' +
          (strong ? 'text-[16px] font-semibold text-ink ' : 'text-[15px] font-medium ') +
          (positive ? 'text-collected-fg ' : negative ? 'text-debt-fg ' : 'text-ink ')
        }
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}
