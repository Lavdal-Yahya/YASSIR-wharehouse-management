import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Money } from '@/components/Money';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { useSalesReport } from '../api';
import type { ReportFilter, SalesReport } from '../types';

// Sales report screen (P7-06 UI). Four breakdowns from one service:
// by paymentStatus, by shop, top products by revenue, by UTC day.
// Each section is its own card so the page reads scannably on
// mobile — you scroll down the sections, not sideways through tabs.

const statusTone: Record<
  SalesReport['byStatus'][number]['paymentStatus'],
  'ok' | 'warn' | 'danger'
> = {
  PAID: 'ok',
  PARTIALLY_PAID: 'warn',
  UNPAID: 'danger',
};

export default function SalesReportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReportFilter>({});
  const q = useSalesReport(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.sales.title')}
        subtitle={t('reports.sales.subtitle')}
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
          <SectionCard title={t('reports.sales.byStatus')}>
            {q.data.byStatus.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.byStatus.map((row) => (
                  <li
                    key={row.paymentStatus}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={statusTone[row.paymentStatus]}>
                        {t(`sales.payment.${row.paymentStatus}`)}
                      </StatusBadge>
                      <span className="text-[13.5px] text-muted tabular-nums">
                        {t('reports.sales.salesCount', { count: row.salesCount })}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-4 text-end">
                      <span className="hidden text-[12.5px] text-muted sm:inline">
                        {t('reports.sales.due')}:{' '}
                        <Money
                          value={row.amountDue}
                          size="sm"
                          className="text-debt-fg"
                        />
                      </span>
                      <Money value={row.salesValue} size="md" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.sales.byShop')}>
            {q.data.byShop.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.byShop.map((row) => (
                  <li
                    key={row.shopId}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[15px] font-semibold text-ink">
                        {row.shopName}
                      </div>
                      <div className="text-[13px] text-muted tabular-nums">
                        {t('reports.sales.salesCount', { count: row.salesCount })}
                        {' · '}
                        {t('reports.shop.cashAtSale')}:{' '}
                        <Money value={row.cashAtSale} size="sm" showCurrency={false} />
                      </div>
                    </div>
                    <Money value={row.salesValue} size="md" />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.sales.byProduct')}>
            {q.data.byProduct.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.byProduct.map((row) => (
                  <li
                    key={row.productId}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[15px] font-semibold text-ink">
                        {row.productName}
                      </div>
                      <div className="text-[13px] text-muted tabular-nums">
                        {t('reports.sales.unitsSold', { count: row.unitsSold })}
                      </div>
                    </div>
                    <Money value={row.revenue} size="md" />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.sales.byDate')}>
            {q.data.byDate.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.byDate.map((row) => (
                  <li
                    key={row.date}
                    className="flex items-center justify-between gap-3 py-3 text-start"
                  >
                    <div className="grow">
                      <div className="text-[14.5px] font-semibold text-ink tabular-nums">
                        {row.date}
                      </div>
                      <div className="text-[13px] text-muted tabular-nums">
                        {t('reports.sales.salesCount', { count: row.salesCount })}
                        {' · '}
                        {t('reports.shop.cashAtSale')}:{' '}
                        <Money value={row.cashAtSale} size="sm" showCurrency={false} />
                      </div>
                    </div>
                    <Money value={row.salesValue} size="md" />
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

function Empty() {
  const { t } = useTranslation();
  return (
    <p className="text-[13.5px] text-muted">{t('common.emptyList')}</p>
  );
}
