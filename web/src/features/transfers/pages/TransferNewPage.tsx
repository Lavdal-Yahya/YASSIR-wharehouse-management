import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { QuantityInput } from '@/components/QuantityInput';
import { SearchInput } from '@/components/SearchInput';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useLocationsList } from '@/features/locations/api';
import { useInventoryBalances } from '@/features/inventory/api';
import { useCreateTransfer } from '../api';
import type { CreateTransferBody } from '../types';

// TransferForm — checklist UX. Pick source, then tick the products to
// send and set a quantity for each ticked row. Destination + date + notes
// sit on top; the summary and submit sit below. WAREHOUSE/OWNER only.

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransferNewPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const create = useCreateTransfer();

  const locations = useLocationsList();
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [transferDate, setTransferDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, number | null>>({});
  const [productSearch, setProductSearch] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const sourceBalances = useInventoryBalances(sourceLocationId || undefined, {
    page: 1,
    pageSize: 100,
    includeZero: false,
  });

  const activeLocations = useMemo(
    () => locations.data?.filter((l) => l.active) ?? [],
    [locations.data],
  );

  const destinations = useMemo(
    () => activeLocations.filter((l) => l.id !== sourceLocationId),
    [activeLocations, sourceLocationId],
  );

  const productsAtSource = useMemo(
    () => sourceBalances.data?.items ?? [],
    [sourceBalances.data],
  );
  const productById = useMemo(
    () => new Map(productsAtSource.map((p) => [p.productId, p])),
    [productsAtSource],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productsAtSource;
    return productsAtSource.filter((p) => {
      const hay = `${p.productName} ${p.sku ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [productsAtSource, productSearch]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => productById.has(id)),
    [selected, productById],
  );

  const onSourceChange = (id: string) => {
    setSourceLocationId(id);
    if (destinationLocationId === id) setDestinationLocationId('');
    setSelected({});
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        // Default to the row's max quantity — a full transfer is the
        // common case when shipping stock to a shop.
        const row = productById.get(productId);
        next[productId] = row?.quantity ?? null;
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  const setQuantity = (productId: string, quantity: number | null) => {
    setSelected((prev) => ({ ...prev, [productId]: quantity }));
  };

  const summary = useMemo(
    () =>
      selectedIds
        .map((id) => {
          const p = productById.get(id);
          const qty = selected[id];
          if (!p || !qty) return null;
          return { name: p.productName, qty };
        })
        .filter((x): x is { name: string; qty: number } => !!x),
    [selectedIds, selected, productById],
  );

  const onSubmit = async () => {
    setLocalError(null);
    if (!sourceLocationId) return setLocalError(t('transfers.form.errors.source'));
    if (!destinationLocationId)
      return setLocalError(t('transfers.form.errors.destination'));
    if (sourceLocationId === destinationLocationId)
      return setLocalError(t('errors.TRANSFER_SAME_LOCATION'));
    if (selectedIds.length === 0)
      return setLocalError(t('transfers.form.errors.noItems'));

    const items: CreateTransferBody['items'] = [];
    for (const productId of selectedIds) {
      const p = productById.get(productId);
      const qty = selected[productId];
      if (!p) continue;
      if (!qty || qty < 1) {
        return setLocalError(
          t('transfers.form.errors.itemQuantity', { product: p.productName }),
        );
      }
      if (qty > p.quantity) {
        return setLocalError(
          t('transfers.form.errors.itemExceeds', {
            product: p.productName,
            max: p.quantity,
          }),
        );
      }
      items.push({ productId, quantity: qty });
    }

    const body: CreateTransferBody = {
      sourceLocationId,
      destinationLocationId,
      transferDate: new Date(transferDate).toISOString(),
      notes: notes.trim() || null,
      items,
    };
    try {
      const created = await create.mutateAsync(body);
      nav(`/transfers/${created.id}`, { replace: true });
    } catch {
      /* surfaced via create.error */
    }
  };

  const sourceName =
    activeLocations.find((l) => l.id === sourceLocationId)?.name ?? '';
  const destinationName =
    activeLocations.find((l) => l.id === destinationLocationId)?.name ?? '';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('transfers.form.newTitle')}
        subtitle={t('transfers.form.newSubtitle')}
      />

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('transfers.form.source')}
          </span>
          <select
            value={sourceLocationId}
            onChange={(e) => onSourceChange(e.target.value)}
            className="block w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
            aria-label={t('transfers.form.source')}
          >
            <option value="">{t('transfers.form.chooseSource')}</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('transfers.form.destination')}
          </span>
          <select
            value={destinationLocationId}
            onChange={(e) => setDestinationLocationId(e.target.value)}
            className="block w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
            aria-label={t('transfers.form.destination')}
            disabled={!sourceLocationId}
          >
            <option value="">{t('transfers.form.chooseDestination')}</option>
            {destinations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('transfers.form.date')}
          </span>
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className="block w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>

        <label className="block text-sm md:col-span-3">
          <span className="mb-1 block text-ink">
            {t('transfers.form.notes')}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="block w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {t('transfers.form.items')}
          </h2>
          <span className="text-xs text-muted tabular-nums">
            {t('transfers.form.checklistCount', {
              count: selectedIds.length,
            })}
          </span>
        </div>
        <p className="mb-3 text-xs text-muted">
          {t('transfers.form.checklistHint')}
        </p>

        {!sourceLocationId ? (
          <p className="text-sm text-muted">
            {t('transfers.form.pickSourceFirst')}
          </p>
        ) : sourceBalances.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t('loading')}
          </div>
        ) : productsAtSource.length === 0 ? (
          <p className="text-sm text-muted">
            {t('transfers.form.sourceEmpty')}
          </p>
        ) : (
          <>
            <div className="mb-3">
              <SearchInput
                value={productSearch}
                onChange={setProductSearch}
                placeholder={t('common.search')}
              />
            </div>
            <ul className="max-h-[28rem] divide-y divide-line-soft overflow-y-auto rounded-md border border-line">
              {filteredProducts.map((row) => {
                const isChecked = row.productId in selected;
                const qty = selected[row.productId] ?? null;
                return (
                  <li
                    key={row.productId}
                    className={`flex items-center gap-3 p-3 ${isChecked ? 'bg-tint' : ''}`}
                  >
                    <input
                      id={`transfer-pick-${row.productId}`}
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => toggleProduct(row.productId, e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-brand"
                      aria-label={row.productName}
                    />
                    <label
                      htmlFor={`transfer-pick-${row.productId}`}
                      className="min-w-0 grow cursor-pointer text-start"
                    >
                      <div className="truncate text-sm font-medium text-ink">
                        {row.productName}
                      </div>
                      <div className="text-xs text-muted">
                        {t('transfers.form.available', { qty: row.quantity })}
                        {row.sku ? <> · {row.sku}</> : null}
                      </div>
                    </label>
                    <div className="w-28 shrink-0">
                      <QuantityInput
                        value={isChecked ? qty : null}
                        onChange={(v) => setQuantity(row.productId, v)}
                        min={1}
                        max={row.quantity}
                        disabled={!isChecked}
                        className="w-full"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {summary.length > 0 && sourceLocationId && destinationLocationId ? (
        <div className="rounded-lg border border-line bg-app p-4 text-sm text-ink">
          <div className="mb-2 font-medium">{t('transfers.form.summaryTitle')}</div>
          <ul className="space-y-1">
            {summary.map((s, i) => (
              <li key={i} className="tabular-nums">
                {t('transfers.form.summaryLine', {
                  qty: s.qty,
                  product: s.name,
                  source: sourceName,
                  destination: destinationName,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(localError || create.error) ? (
        <p role="alert" className="rounded-md bg-debt-bg p-3 text-sm text-debt-fg">
          {localError ?? (create.error ? errorMessage(create.error, t) : '')}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => nav('/transfers')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} loading={create.isPending}>
          {t('transfers.form.submit')}
        </Button>
      </div>
    </div>
  );
}
