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

// TransferForm (P4-05):
//   1. Pick source location (warehouse + active shops).
//   2. Pick destination (excludes the chosen source).
//   3. Add lines: each line's product dropdown lists products that actually
//      have stock at the source, with the available quantity shown; the
//      quantity input is capped client-side at that available number. The
//      server re-validates via the inventory chokepoint.
//   4. Submit — confirmation is the summary lines visible above the button.
//
// Only WAREHOUSE/OWNER see this page (route-guarded); SHOP users have no
// transfer route at all (D-014).

type Line = { productId: string; quantity: number | null };

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
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: null }]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Balances at the source — populates the per-line product picker with the
  // available quantity next to each name. Empty until source is picked.
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

  const productsAtSource = sourceBalances.data?.items ?? [];
  const productById = useMemo(
    () => new Map(productsAtSource.map((p) => [p.productId, p])),
    [productsAtSource],
  );

  // Client-side name filter. Source balances cap at pageSize=100 (server
  // max) — small enough to filter in the browser. The selected product on
  // each line is re-added below so a narrow search never blanks a row.
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productsAtSource;
    return productsAtSource.filter((p) =>
      p.productName.toLowerCase().includes(q),
    );
  }, [productsAtSource, productSearch]);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines((prev) => [...prev, { productId: '', quantity: null }]);

  const onSourceChange = (id: string) => {
    setSourceLocationId(id);
    // If the destination equals the new source, clear it — the picker will
    // exclude it anyway, but this makes the state consistent.
    if (destinationLocationId === id) setDestinationLocationId('');
    // Product selections may not exist at the new source. Reset them.
    setLines((prev) => prev.map((l) => ({ ...l, productId: '', quantity: null })));
  };

  const summary = useMemo(() => {
    const items = lines
      .map((l) => {
        const p = productById.get(l.productId);
        if (!p || !l.quantity) return null;
        return { name: p.productName, qty: l.quantity };
      })
      .filter((x): x is { name: string; qty: number } => !!x);
    return items;
  }, [lines, productById]);

  // Same-productId guard purely for the summary UX; the server rejects too.
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    for (const l of lines) {
      if (!l.productId) continue;
      if (seen.has(l.productId)) return l.productId;
      seen.add(l.productId);
    }
    return null;
  }, [lines]);

  const onSubmit = async () => {
    setLocalError(null);
    if (!sourceLocationId) return setLocalError(t('transfers.form.errors.source'));
    if (!destinationLocationId)
      return setLocalError(t('transfers.form.errors.destination'));
    if (sourceLocationId === destinationLocationId)
      return setLocalError(t('errors.TRANSFER_SAME_LOCATION'));
    if (duplicate) return setLocalError(t('errors.DUPLICATE_TRANSFER_ITEM'));

    const items: CreateTransferBody['items'] = [];
    for (const [i, l] of lines.entries()) {
      if (!l.productId) {
        return setLocalError(t('transfers.form.errors.itemProduct', { line: i + 1 }));
      }
      if (!l.quantity || l.quantity < 1) {
        return setLocalError(t('transfers.form.errors.itemQuantity', { line: i + 1 }));
      }
      const p = productById.get(l.productId);
      // p can be undefined while balances load — refuse rather than sending
      // an unverified quantity.
      if (!p) {
        return setLocalError(t('transfers.form.errors.itemProduct', { line: i + 1 }));
      }
      if (l.quantity > p.quantity) {
        return setLocalError(
          t('transfers.form.errors.itemExceeds', {
            product: p.productName,
            max: p.quantity,
          }),
        );
      }
      items.push({ productId: l.productId, quantity: l.quantity });
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {t('transfers.form.items')}
          </h2>
          <Button variant="ghost" onClick={addLine} disabled={!sourceLocationId}>
            {t('transfers.form.addRow')}
          </Button>
        </div>

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
            <ul className="space-y-3">
            {lines.map((l, idx) => {
              const p = productById.get(l.productId);
              const optionsForLine =
                p && !filteredProducts.some((f) => f.productId === p.productId)
                  ? [p, ...filteredProducts]
                  : filteredProducts;
              return (
                <li key={idx} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-muted">
                      {t('transfers.form.line', { n: idx + 1 })}
                    </div>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-xs text-debt-fg hover:underline"
                      >
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                    <select
                      value={l.productId}
                      onChange={(e) =>
                        updateLine(idx, {
                          productId: e.target.value,
                          quantity: null,
                        })
                      }
                      aria-label={t('transfers.form.product')}
                      className="w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="">{t('orders.form.chooseProduct')}</option>
                      {optionsForLine.map((row) => (
                        <option key={row.productId} value={row.productId}>
                          {row.productName} — {t('transfers.form.available', { qty: row.quantity })}
                        </option>
                      ))}
                    </select>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-muted">
                        {t('transfers.form.quantity')}
                        {p ? (
                          <span className="ms-1 text-muted">
                            ({t('transfers.form.max', { max: p.quantity })})
                          </span>
                        ) : null}
                      </span>
                      <QuantityInput
                        value={l.quantity}
                        onChange={(v) => updateLine(idx, { quantity: v })}
                        min={1}
                        max={p?.quantity}
                        disabled={!p}
                        className="w-full"
                      />
                    </label>
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
                  source:
                    activeLocations.find((l) => l.id === sourceLocationId)?.name ?? '',
                  destination:
                    activeLocations.find((l) => l.id === destinationLocationId)?.name ??
                    '',
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
