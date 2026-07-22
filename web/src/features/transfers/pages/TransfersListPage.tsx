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
import { useLocationsList } from '@/features/locations/api';
import { useTransfersList } from '../api';
import type { TransferStatus } from '../types';

const STATUSES: TransferStatus[] = ['COMPLETED', 'REVERSED'];

const toneFor = (s: TransferStatus): 'ok' | 'muted' =>
  s === 'COMPLETED' ? 'ok' : 'muted';

export default function TransfersListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [status, setStatus] = useState<string>('');

  const locations = useLocationsList();
  const list = useTransfersList({
    page,
    pageSize: 25,
    search: search || undefined,
    sourceLocationId: sourceLocationId || undefined,
    destinationLocationId: destinationLocationId || undefined,
    status: status || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('transfers.title')}
        subtitle={t('transfers.subtitle')}
        actions={
          <Link to="/transfers/new">
            <Button>{t('transfers.new')}</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          placeholder={t('transfers.searchPlaceholder')}
        />
        <select
          value={sourceLocationId}
          onChange={(e) => {
            setPage(1);
            setSourceLocationId(e.target.value);
          }}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('transfers.filter.source')}
        >
          <option value="">
            {t('transfers.filter.source')} — {t('transfers.filter.allLocations')}
          </option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={destinationLocationId}
          onChange={(e) => {
            setPage(1);
            setDestinationLocationId(e.target.value);
          }}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('transfers.filter.destination')}
        >
          <option value="">
            {t('transfers.filter.destination')} —{' '}
            {t('transfers.filter.allLocations')}
          </option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('transfers.filter.status')}
        >
          <option value="">{t('transfers.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`transfers.status.${s}`)}
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
            {list.data?.items.map((tr) => (
              <li key={tr.id} className="flex items-center gap-3 p-3 text-start">
                <div className="min-w-0 grow">
                  <Link
                    to={`/transfers/${tr.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {tr.referenceNumber}
                  </Link>
                  <div className="text-xs text-muted">
                    {tr.sourceLocationName} → {tr.destinationLocationName}
                    {' · '}
                    {new Date(tr.transferDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-end text-xs text-muted tabular-nums">
                  {t('transfers.columns.items')}: {tr.itemCount}
                  {' · '}
                  {t('transfers.columns.quantity')}: {tr.totalQuantity}
                </div>
                <StatusBadge tone={toneFor(tr.status)}>
                  {t(`transfers.status.${tr.status}`)}
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
