import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useLocationsList } from '@/features/locations/api';
import { useInventoryMovements } from '../api';
import type { MovementRow } from '../types';

// Movement history (P3-11). Read-only ledger — there is no edit affordance
// anywhere near stock numbers (phase-3 §4). Every row: date · type · qty
// with direction (＋/−/→) · source→destination · ref · user.

const MOVEMENT_TYPES: MovementRow['movementType'][] = [
  'OPENING_STOCK',
  'ORDER_RECEIPT',
  'DIRECT_RECEIPT',
  'TRANSFER',
  'SALE',
  'SALE_CANCELLATION',
  'CUSTOMER_RETURN',
  'STOCK_CORRECTION',
];

export default function MovementsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);

  // Filters live in the URL so the "history for product X" link from the
  // warehouse page (P3-10) lands here pre-filtered and shareable.
  const productId = params.get('productId') ?? '';
  const locationId = params.get('locationId') ?? '';
  const movementType = params.get('movementType') ?? '';

  const locations = useLocationsList();
  const list = useInventoryMovements({
    page,
    pageSize: 25,
    productId: productId || undefined,
    locationId: locationId || undefined,
    movementType: movementType || undefined,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  return (
    <div>
      <PageHeader title={t('movements.title')} subtitle={t('movements.subtitle')} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <select
          value={locationId}
          onChange={(e) => setFilter('locationId', e.target.value)}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('movements.filter.location')}
        >
          <option value="">{t('movements.filter.allLocations')}</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={movementType}
          onChange={(e) => setFilter('movementType', e.target.value)}
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('movements.filter.type')}
        >
          <option value="">{t('movements.filter.allTypes')}</option>
          {MOVEMENT_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {t(`movements.type.${tp}`)}
            </option>
          ))}
        </select>
        {productId ? (
          <div className="flex items-center justify-between rounded-md border border-line bg-app px-3 py-2 text-xs text-muted">
            <span>{t('movements.filter.pinnedProduct')}</span>
            <button
              type="button"
              onClick={() => setFilter('productId', '')}
              className="text-xs font-medium text-ink hover:underline"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : null}
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
            {list.data?.items.map((m) => (
              <MovementRowView key={m.id} row={m} />
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

function MovementRowView({ row }: { row: MovementRow }) {
  const { t, i18n } = useTranslation();
  const isMove = row.sourceLocationId && row.destinationLocationId;
  const isIn = !row.sourceLocationId && row.destinationLocationId;
  const dir = isMove ? '→' : isIn ? '＋' : '−';
  const dirTone = isMove
    ? 'text-muted'
    : isIn
    ? 'text-emerald-700'
    : 'text-debt-fg';
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const routeLabel = isMove
    ? `${row.sourceLocationName} → ${row.destinationLocationName}`
    : isIn
    ? row.destinationLocationName
    : row.sourceLocationName;

  return (
    <li className="grid gap-1 p-3 text-start md:grid-cols-[7rem_10rem_1fr_9rem_5rem] md:items-center md:gap-3">
      <div className="text-xs text-muted tabular-nums">
        {dateFmt.format(new Date(row.createdAt))}
      </div>
      <div className="text-xs font-medium text-ink">
        {t(`movements.type.${row.movementType}`)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{row.productName}</div>
        <div className="truncate text-xs text-muted">{routeLabel ?? '—'}</div>
      </div>
      <div className="truncate text-xs text-muted">
        {row.relatedEntityReference ?? row.relatedEntityType ?? '—'}
      </div>
      <div className={`text-end text-sm font-semibold tabular-nums ${dirTone}`}>
        <span className="me-1">{dir}</span>
        {row.quantity}
      </div>
    </li>
  );
}
