import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { formatMoney } from '@/shared/money';
import { errorMessage } from '@/shared/error-message';
import { Role } from '@/shared/enums';
import { useCategoriesList } from '@/features/categories/api';
import { useLocationsList } from '@/features/locations/api';
import { useMe } from '@/features/auth/api';
import { useInventoryBalances } from '../api';

// Shop-scoped stock view (P4-07). SHOP employees always see their own
// shop's location (server enforces via ShopScopeGuard — client passes the
// matching locationId as courtesy but the guard substitutes if wrong).
// OWNER sees an active-shop picker so they can eyeball each shop.
export default function ShopStockPage() {
  const { t } = useTranslation();
  const me = useMe();
  const locations = useLocationsList();

  const shopLocations = useMemo(
    () =>
      (locations.data ?? []).filter((l) => l.type === 'SHOP' && l.active),
    [locations.data],
  );

  const user = me.data?.user;
  const isOwner = user?.role === Role.OWNER;

  const ownLocationId = useMemo(() => {
    if (!user || user.role !== Role.SHOP || !user.assignedShopId) return undefined;
    return shopLocations.find((l) => l.shopId === user.assignedShopId)?.id;
  }, [user, shopLocations]);

  const [pickedShopLocation, setPickedShopLocation] = useState('');
  const activeLocationId = isOwner ? pickedShopLocation : ownLocationId;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const list = useInventoryBalances(activeLocationId || undefined, {
    page,
    pageSize: 25,
    search: search || undefined,
    categoryId: categoryId || undefined,
    lowStockOnly: stockFilter === 'low' || undefined,
    outOfStockOnly: stockFilter === 'out' || undefined,
    includeZero: stockFilter === 'out' || undefined,
  });
  const cats = useCategoriesList({ page: 1, pageSize: 100 });

  return (
    <div>
      <PageHeader
        title={t('shopStock.title')}
        subtitle={t('shopStock.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Sell is placeholder (Phase 5 wires it). Kept visible so the
                shop layout is final. */}
            <Button disabled title={t('shopStock.sellSoon')}>
              {t('shopStock.sell')}
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {isOwner ? (
          <select
            value={pickedShopLocation}
            onChange={(e) => {
              setPage(1);
              setPickedShopLocation(e.target.value);
            }}
            className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
            aria-label={t('shopStock.pickShop')}
          >
            <option value="">{t('shopStock.pickShop')}</option>
            {shopLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : null}
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
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
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
          className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          aria-label={t('warehouse.filter.stock')}
        >
          <option value="all">{t('warehouse.filter.stockAll')}</option>
          <option value="low">{t('warehouse.filter.stockLow')}</option>
          <option value="out">{t('warehouse.filter.stockOut')}</option>
        </select>
      </div>

      {!activeLocationId ? (
        <p className="rounded-md bg-app p-3 text-sm text-muted">
          {isOwner ? t('shopStock.pickShop') : t('loading')}
        </p>
      ) : (
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
              {list.data?.items.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center gap-3 p-3 text-start"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-tint">
                    {row.imageUrl ? (
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 grow">
                    <Link
                      to={`/warehouse/movements?productId=${row.productId}&locationId=${activeLocationId}`}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {row.productName}
                    </Link>
                    <div className="text-xs text-muted">
                      {row.categoryName}
                      {row.sku ? <> · {row.sku}</> : null}
                      {row.suggestedSalePrice !== null ? (
                        <> · {formatMoney(row.suggestedSalePrice)}</>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold tabular-nums text-ink">
                      {row.quantity}
                    </div>
                    {row.isOutOfStock ? (
                      <StatusBadge tone="danger">
                        {t('warehouse.badge.outOfStock')}
                      </StatusBadge>
                    ) : row.isLowStock ? (
                      <StatusBadge tone="warn">
                        {t('warehouse.badge.lowStock')}
                      </StatusBadge>
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
