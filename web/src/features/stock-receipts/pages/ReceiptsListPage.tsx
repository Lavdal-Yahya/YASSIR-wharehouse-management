import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useReceiptsList } from '../api';

export default function ReceiptsListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'' | 'direct' | 'order'>('');

  const list = useReceiptsList({
    page,
    pageSize: 25,
    search: search || undefined,
    source: source || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('receipts.title')}
        subtitle={t('receipts.subtitle')}
        actions={
          <Link to="/warehouse/receipts/direct">
            <Button>{t('warehouse.actions.directReceipt')}</Button>
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
          placeholder={t('receipts.searchPlaceholder')}
        />
        <select
          value={source}
          onChange={(e) => {
            setPage(1);
            setSource(e.target.value as '' | 'direct' | 'order');
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          aria-label={t('receipts.filter.source')}
        >
          <option value="">{t('receipts.filter.allSources')}</option>
          <option value="direct">{t('receipts.filter.direct')}</option>
          <option value="order">{t('receipts.filter.order')}</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {list.isLoading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="p-3 text-sm text-red-700">
            {errorMessage(list.error, t)}
          </p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data?.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3 text-start">
                <div className="min-w-0 grow">
                  <Link
                    to={`/warehouse/receipts/${r.id}`}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {r.referenceNumber}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.incomingOrderReference ?? t('receipts.direct.title')}
                    {r.supplierName ? ` · ${r.supplierName}` : ''}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(r.receiptDate).toLocaleDateString()}
                </div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {r.totalQuantity}
                </div>
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
