import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { useDebtReport } from '../api';
import type { ReportFilter } from '../types';

// Debt report screen (P7-07 UI). Three related lists:
//   * outstanding by customer — who owes what (as-of, not date-bound)
//   * outstanding by shop — where the debt sits
//   * payments in period — the audit trail for money that came in
//
// Outstanding uses as-of scope on the server; the date range only
// affects paymentsInPeriod.

export default function DebtReportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReportFilter>({});
  const q = useDebtReport(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.debt.title')}
        subtitle={t('reports.debt.subtitle')}
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
        <div className="flex flex-col gap-5">
          <SectionCard title={t('reports.debt.byCustomer')}>
            {q.data.outstandingByCustomer.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                {t('reports.debt.noDebt')}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.outstandingByCustomer.map((row) => (
                  <li
                    key={row.customerId}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[15px] font-semibold text-ink">
                        {row.customerName}
                      </div>
                      <div className="text-[13px] text-muted">
                        {row.customerPhone ?? '—'}
                        {' · '}
                        {t('reports.debt.customerBreakdown', {
                          unpaid: row.unpaidSalesCount,
                          partial: row.partialSalesCount,
                        })}
                      </div>
                    </div>
                    <Money
                      value={row.outstanding}
                      size="md"
                      className="text-debt-fg"
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.debt.byShop')}>
            {q.data.outstandingByShop.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                {t('reports.debt.noDebt')}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.outstandingByShop.map((row) => (
                  <li
                    key={row.shopId}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[15px] font-semibold text-ink">
                        {row.shopName}
                      </div>
                      <div className="text-[13px] text-muted tabular-nums">
                        {t('reports.debt.debtorsCount', {
                          count: row.debtorsCount,
                        })}
                      </div>
                    </div>
                    <Money
                      value={row.outstanding}
                      size="md"
                      className="text-debt-fg"
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.debt.paymentsInPeriod')}>
            {q.data.paymentsInPeriod.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                {t('reports.debt.noPayments')}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.paymentsInPeriod.map((p) => (
                  <li
                    key={p.paymentId}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[14.5px] font-semibold text-ink">
                        {p.referenceNumber}
                      </div>
                      <div className="text-[13px] text-muted">
                        {new Date(p.paymentDate).toLocaleDateString()}
                        {' · '}
                        {p.customerName}
                        {' · '}
                        {p.shopName}
                      </div>
                    </div>
                    <Money
                      value={p.amount}
                      size="md"
                      className="text-collected-fg"
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
