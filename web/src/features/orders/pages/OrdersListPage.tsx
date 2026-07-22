import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useOrdersList } from '../api';
import type { OrderStatus } from '../types';

const STATUSES: OrderStatus[] = [
  'ORDERED',
  'SHIPPED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

// Status → badge tone (text + color, never color alone per §38.4).
const toneFor = (s: OrderStatus): 'ok' | 'warn' | 'muted' | 'danger' => {
  switch (s) {
    case 'RECEIVED':
      return 'ok';
    case 'PARTIALLY_RECEIVED':
    case 'SHIPPED':
      return 'warn';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'muted';
  }
};

export default function OrdersListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');

  const list = useOrdersList({
    page,
    pageSize: 25,
    search: search || undefined,
    status: status || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
        actions={
          <Link to="/orders/new">
            <Button>{t('orders.new')}</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <SearchInput
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          placeholder={t('orders.searchPlaceholder')}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('orders.filter.status')}
        >
          <option value="">{t('orders.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-line bg-white p-2 shadow-sm">
        {list.isLoading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="p-3 text-sm text-debt-fg">
            {errorMessage(list.error, t)}
          </p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="p-3 text-sm text-muted">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.data?.items.map((o) => (
              <li key={o.id} className="flex items-center gap-3 p-3 text-start">
                <div className="min-w-0 grow">
                  <Link
                    to={`/orders/${o.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {o.referenceNumber}
                  </Link>
                  <div className="text-xs text-muted">
                    {o.supplierName ?? t('orders.noSupplier')}
                    {' · '}
                    {new Date(o.orderDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-end text-xs text-muted tabular-nums">
                  <div>
                    {t('orders.receivedOf', {
                      received: o.totalReceived,
                      ordered: o.totalOrdered,
                    })}
                  </div>
                  {o.totalRemaining > 0 && o.status !== 'CANCELLED' ? (
                    <div className="text-amber-700">
                      {t('orders.remaining', { count: o.totalRemaining })}
                    </div>
                  ) : null}
                </div>
                <StatusBadge tone={toneFor(o.status)}>
                  {t(`orders.status.${o.status}`)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}

        {list.data ? (
          <div className="px-2">
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
