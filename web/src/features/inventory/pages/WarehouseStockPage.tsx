import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { Money } from '@/components/Money';
import { errorMessage } from '@/shared/error-message';
import { useCategoriesList } from '@/features/categories/api';
import { useWarehouseLocation } from '@/features/locations/api';
import { useInventoryBalances } from '../api';

// Warehouse home for OWNER/WAREHOUSE: current balances at the central
// warehouse (spec §14). Search, category filter, low/out badges (text +
// color per §38.4), row link to per-product movement history. This is the
// warehouse employee's home — actions like receive/transfer/correct live
// on their own screens, not scattered inline.

export default function WarehouseStockPage() {
  const { t } = useTranslation();
  const warehouse = useWarehouseLocation();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const list = useInventoryBalances(warehouse?.id, {
    page,
    pageSize: 25,
    search: search || undefined,
    categoryId: categoryId || undefined,
    lowStockOnly: stockFilter === 'low' || undefined,
    outOfStockOnly: stockFilter === 'out' || undefined,
    // out-of-stock users expect to see zeros; otherwise we hide them
    // (a product that was here and is now empty stays visible via the
    // low-stock badge until the stock filter is switched).
    includeZero: stockFilter === 'out' || undefined,
  });
  const cats = useCategoriesList({ page: 1, pageSize: 100 });

  return (
    <div>
      <PageHeader
        title={t('warehouse.title')}
        subtitle={t('warehouse.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/orders">
              <Button variant="ghost">{t('warehouse.actions.orders')}</Button>
            </Link>
            <Link to="/warehouse/movements">
              <Button variant="ghost">{t('warehouse.actions.movements')}</Button>
            </Link>
            <Link to="/warehouse/receipts/direct">
              <Button>{t('warehouse.actions.directReceipt')}</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          placeholder={t('warehouse.searchPlaceholder')}
        />
        <select
          value={categoryId}
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value);
          }}
          className="rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
          aria-label={t('warehouse.filter.category')}
        >
          <option value="">{t('warehouse.filter.allCategories')}</option>
          {cats.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => {
            setPage(1);
            setStockFilter(e.target.value as 'all' | 'low' | 'out');
          }}
          className="rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
          aria-label={t('warehouse.filter.stock')}
        >
          <option value="all">{t('warehouse.filter.stockAll')}</option>
          <option value="low">{t('warehouse.filter.stockLow')}</option>
          <option value="out">{t('warehouse.filter.stockOut')}</option>
        </select>
        <Link to="/warehouse/corrections" className="flex items-center justify-center">
          <Button variant="ghost" className="w-full">
            {t('warehouse.actions.corrections')}
          </Button>
        </Link>
      </div>

      {!warehouse ? (
        <div className="flex items-center gap-2 p-3 text-sm text-muted">
          <Spinner /> {t('loading')}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-2 shadow-sm">
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
              {list.data?.items.map((row) => (
                <li key={row.productId} className="flex items-center gap-3 p-3 text-start">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-tint">
                    {row.imageUrl ? (
                      <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 grow">
                    <Link
                      to={`/warehouse/movements?productId=${row.productId}`}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {row.productName}
                    </Link>
                    <div className="text-xs text-muted">
                      {row.categoryName}
                      {row.sku ? <> · {row.sku}</> : null}
                      {row.suggestedSalePrice !== null ? (
                        <>
                          {' · '}
                          <Money value={row.suggestedSalePrice} size="sm" />
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold tabular-nums text-ink">
                      {row.quantity}
                    </div>
                    {row.isOutOfStock ? (
                      <StatusBadge tone="danger">{t('warehouse.badge.outOfStock')}</StatusBadge>
                    ) : row.isLowStock ? (
                      <StatusBadge tone="warn">{t('warehouse.badge.lowStock')}</StatusBadge>
                    ) : null}
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
      )}
    </div>
  );
}
