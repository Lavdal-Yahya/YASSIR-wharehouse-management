import { useState } from 'react';
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
import { useCategoriesList } from '@/features/categories/api';
import { useProductsList } from '../api';

export default function ProductsListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const list = useProductsList({
    page,
    pageSize: 25,
    search: search || undefined,
    categoryId: categoryId || undefined,
    includeArchived,
  });
  // For the filter dropdown; owner-only shows archived, but categories on the
  // active filter list are enough for warehouse/shop pickers.
  const cats = useCategoriesList({ page: 1, pageSize: 100 });

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        actions={
          <Link to="/products/new">
            <Button>{t('products.new')}</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SearchInput
          value={search}
          onChange={(v) => { setPage(1); setSearch(v); }}
          placeholder={t('products.searchPlaceholder')}
        />
        <select
          value={categoryId}
          onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}
          className="rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
          aria-label={t('products.filter.category')}
        >
          <option value="">{t('products.filter.allCategories')}</option>
          {cats.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
          />
          {t('common.includeArchived')}
        </label>
      </div>

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
            {list.data?.items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3 text-start">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-tint">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 grow">
                  <Link to={`/products/${p.id}`} className="text-sm font-medium text-ink hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {p.categoryName}
                    {p.sku ? <> · {p.sku}</> : null}
                  </div>
                </div>
                <div className="hidden text-xs text-muted md:block">
                  {formatMoney(p.defaultSalePrice)}
                </div>
                {p.active ? null : (
                  <StatusBadge tone="muted">{t('common.archived')}</StatusBadge>
                )}
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
