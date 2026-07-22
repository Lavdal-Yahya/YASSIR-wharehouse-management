import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { ReportFilters } from '../components/ReportFilters';
import { useIncomingOrdersReport } from '../api';
import type { IncomingOrdersReport, ReportFilter } from '../types';

// Incoming orders report screen (P7-08 UI). Two sections:
//   * byStatus roll-up — ordered / received / remaining by lifecycle stage
//   * recentOrders — deep-linkable list newest-first
//
// Warehouse-side, no shop scoping. Cancelled orders show in byStatus
// so the audit trail is visible without their remaining distorting
// operational tiles above.

type OrderStatus = IncomingOrdersReport['byStatus'][number]['status'];

const statusTone: Record<OrderStatus, 'ok' | 'warn' | 'muted' | 'danger'> = {
  ORDERED: 'muted',
  SHIPPED: 'warn',
  PARTIALLY_RECEIVED: 'warn',
  RECEIVED: 'ok',
  CANCELLED: 'muted',
};

export default function IncomingOrdersReportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Omit<ReportFilter, 'shopId'>>({});
  const q = useIncomingOrdersReport(filter);

  return (
    <div>
      <PageHeader
        title={t('reports.incomingOrders.title')}
        subtitle={t('reports.incomingOrders.subtitle')}
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
        <div className="flex flex-col gap-5">
          <SectionCard title={t('reports.incomingOrders.byStatus')}>
            {q.data.byStatus.length === 0 ? (
              <p className="text-[13.5px] text-muted">{t('common.emptyList')}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.byStatus.map((row) => (
                  <li
                    key={row.status}
                    className="grid grid-cols-2 items-center gap-3 py-3 text-start sm:grid-cols-5"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <StatusBadge tone={statusTone[row.status]}>
                        {t(`reports.incomingOrders.status.${row.status}`)}
                      </StatusBadge>
                    </div>
                    <NumCell
                      label={t('reports.incomingOrders.ordersCount')}
                      value={row.ordersCount}
                    />
                    <NumCell
                      label={t('reports.incomingOrders.ordered')}
                      value={row.orderedUnits}
                    />
                    <NumCell
                      label={t('reports.incomingOrders.received')}
                      value={row.receivedUnits}
                      tone="positive"
                    />
                    <NumCell
                      label={t('reports.incomingOrders.remaining')}
                      value={row.remainingUnits}
                      tone={row.remainingUnits > 0 ? 'debt' : 'muted'}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t('reports.incomingOrders.recent')}>
            {q.data.recentOrders.length === 0 ? (
              <p className="text-[13.5px] text-muted">{t('common.emptyList')}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {q.data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="flex items-center justify-between gap-3 py-3 text-start hover:bg-tint/40"
                    >
                      <div className="grow">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-ink">
                            {o.referenceNumber}
                          </span>
                          <StatusBadge tone={statusTone[o.status]}>
                            {t(`reports.incomingOrders.status.${o.status}`)}
                          </StatusBadge>
                        </div>
                        <div className="text-[13px] text-muted">
                          {new Date(o.orderDate).toLocaleDateString()}
                          {o.supplierName ? <> · {o.supplierName}</> : null}
                        </div>
                      </div>
                      <div className="text-end text-[13px] text-muted tabular-nums">
                        {t('reports.incomingOrders.receivedOverOrdered', {
                          received: o.receivedUnits,
                          ordered: o.orderedUnits,
                        })}
                      </div>
                    </Link>
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

function NumCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'positive' | 'debt' | 'muted';
}) {
  const colour =
    tone === 'positive'
      ? 'text-collected-fg'
      : tone === 'debt'
      ? 'text-debt-fg'
      : tone === 'muted'
      ? 'text-muted'
      : 'text-ink';
  return (
    <div className="flex flex-col text-start">
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span
        className={`tabular-nums text-[15px] font-semibold ${colour}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}
