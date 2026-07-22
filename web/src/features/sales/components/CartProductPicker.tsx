import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/SearchInput';
import { StatusBadge } from '@/components/StatusBadge';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { PlusIcon } from '@/components/icons';
import { errorMessage } from '@/shared/error-message';
import { useCategoriesList } from '@/features/categories/api';
import { useInventoryBalances } from '@/features/inventory/api';
import type { BalanceRow } from '@/features/inventory/types';

// Product picker for the sale flow. Uses the shop's inventory balances
// so quantities reflect what's actually available *right now*. Rows
// are 44px+ touch targets with a big + button — one-handed use at a
// counter is the whole point.

type Props = {
  locationId: string;
  onAdd: (product: {
    id: string;
    name: string;
    availableQty: number;
    suggestedSalePrice: number | null;
  }) => void;
  /** Optional filter so already-in-cart products don't reappear as addable — kept simple as a set of productIds. */
  cartProductIds: Set<string>;
};

export function CartProductPicker({ locationId, onAdd, cartProductIds }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const balances = useInventoryBalances(locationId, {
    page: 1,
    pageSize: 50,
    search: search || undefined,
    categoryId: categoryId || undefined,
  });
  const categories = useCategoriesList({ page: 1, pageSize: 100 });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('sell.picker.searchPlaceholder')}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-[50px] rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-[15px] text-ink focus:outline focus:outline-2 focus:outline-brand"
          aria-label={t('sell.picker.category')}
        >
          <option value="">{t('sell.picker.allCategories')}</option>
          {categories.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {balances.isLoading ? (
        <div className="flex items-center gap-2 p-2 text-[14px] text-muted">
          <Spinner /> {t('loading')}
        </div>
      ) : balances.error ? (
        <p
          role="alert"
          className="rounded-input bg-debt-bg p-2 text-[14px] font-medium text-debt-fg"
        >
          {errorMessage(balances.error, t)}
        </p>
      ) : balances.data && balances.data.items.length === 0 ? (
        <p className="p-2 text-[14px] text-muted">{t('sell.picker.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {balances.data?.items.map((row) => (
            <ProductRow
              key={row.productId}
              row={row}
              inCart={cartProductIds.has(row.productId)}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({
  row,
  inCart,
  onAdd,
}: {
  row: BalanceRow;
  inCart: boolean;
  onAdd: Props['onAdd'];
}) {
  const { t } = useTranslation();
  const outOfStock = row.quantity <= 0;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint text-[10px] font-medium text-brand">
        IMG
      </div>
      <div className="min-w-0 grow text-start">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">
            {row.productName}
          </span>
          {row.isOutOfStock ? (
            <StatusBadge tone="danger">{t('sell.picker.outOfStock')}</StatusBadge>
          ) : row.isLowStock ? (
            <StatusBadge tone="warn">{t('sell.picker.lowStock')}</StatusBadge>
          ) : null}
        </div>
        <div className="text-[13px] text-muted tabular-nums">
          {t('sell.picker.available')}: {row.quantity}
          {row.suggestedSalePrice !== null ? (
            <>
              {' · '}
              <Money value={row.suggestedSalePrice} size="sm" showCurrency />
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          onAdd({
            id: row.productId,
            name: row.productName,
            availableQty: row.quantity,
            suggestedSalePrice: row.suggestedSalePrice,
          })
        }
        disabled={outOfStock || inCart}
        aria-label={t('sell.picker.add')}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-input bg-brand text-white transition-colors hover:bg-brand-pressed disabled:bg-neutral-bg disabled:text-muted"
      >
        <PlusIcon size={20} />
      </button>
    </li>
  );
}
