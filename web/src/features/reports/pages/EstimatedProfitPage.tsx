import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { StatCard } from '../components/StatCard';
import { useEstimatedProfit } from '../api';
import type { ReportFilter } from '../types';

// Estimated profit screen (P7-09 UI). The label discipline from
// spec §27 is the whole point:
//   * Never render "net profit"
//   * Label the figure "estimated" whenever any cost snapshot is
//     missing (isEstimated === true); show the coverage % next to it
//   * Full coverage → drop the "estimated" prefix and the coverage bar
//
// Service response never carries netProfit; this UI honours the
// contract by design.

export default function EstimatedProfitPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReportFilter>({});
  const q = useEstimatedProfit(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.profit.title')}
        subtitle={t('reports.profit.subtitle')}
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
          <SectionCard elevated className="mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
                {q.data.isEstimated
                  ? t('reports.profit.grossEstimated')
                  : t('reports.profit.gross')}
              </span>
              <Money value={q.data.grossEstimated} size="xl" />
            </div>
            {q.data.isEstimated ? (
              <CoverageBar
                ratio={q.data.coverage.ratio}
                lineCount={q.data.coverage.lineCount}
                linesWithCost={q.data.coverage.linesWithCost}
              />
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                {t('reports.profit.fullCoverage')}
              </p>
            )}
          </SectionCard>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label={t('reports.profit.salesValue')}
              money={q.data.salesValue}
            />
            <StatCard
              label={t('reports.profit.cogs')}
              money={q.data.cogs}
              tone="muted"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function CoverageBar({
  ratio,
  lineCount,
  linesWithCost,
}: {
  ratio: number;
  lineCount: number;
  linesWithCost: number;
}) {
  const { t } = useTranslation();
  const pct = Math.round(ratio * 100);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[12.5px] text-muted">
        <span>
          {t('reports.profit.coverageLabel', {
            withCost: linesWithCost,
            total: lineCount,
          })}
        </span>
        <span className="tabular-nums font-semibold text-ink">{pct}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-[4px] bg-line-soft"
        aria-hidden
      >
        <div
          className="h-full bg-partial"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[12.5px] text-partial-fg">
        {t('reports.profit.estimatedHint')}
      </p>
    </div>
  );
}
