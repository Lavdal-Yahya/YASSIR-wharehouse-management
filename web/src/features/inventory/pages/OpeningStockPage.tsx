import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { QuantityInput } from '@/components/QuantityInput';
import { ProductPicker } from '@/components/ProductPicker';
import { MoneyInput } from '@/components/MoneyInput';
import { Input } from '@/components/Input';
import { errorMessage } from '@/shared/error-message';
import { useLocationsList } from '@/features/locations/api';
import { useCreateOpeningStock } from '../api';

// Opening stock (spec §13, P3-08 UI). OWNER-only entry point at
// /settings/opening-stock. Rejected server-side if the (location, product)
// pair already has any movement — corrections handle those.

type DraftItem = {
  productId: string;
  quantity: number | null;
  unitCost: number | null;
  notes: string;
};

const EMPTY: DraftItem = { productId: '', quantity: null, unitCost: null, notes: '' };

export default function OpeningStockPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const locations = useLocationsList();
  const create = useCreateOpeningStock();
  const [locationId, setLocationId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY }]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const onSubmit = async () => {
    setLocalError(null);
    setSuccess(null);
    if (!locationId) return setLocalError(t('openingStock.errors.location'));
    const body = items
      .filter((it) => it.productId && it.quantity && it.quantity > 0)
      .map((it) => ({
        productId: it.productId,
        quantity: it.quantity as number,
        unitCost: it.unitCost ?? undefined,
        notes: it.notes.trim() || null,
      }));
    if (body.length === 0) return setLocalError(t('openingStock.errors.empty'));
    try {
      const res = await create.mutateAsync({ locationId, items: body });
      setSuccess(
        t('openingStock.success', { count: res.itemCount, total: res.totalQuantity }),
      );
      setItems([{ ...EMPTY }]);
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('openingStock.title')}
        subtitle={t('openingStock.subtitle')}
      />

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <label className="block text-sm">
          <span className="mb-1 block text-ink">{t('openingStock.location')}</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink"
            aria-label={t('openingStock.location')}
          >
            <option value="">{t('corrections.form.chooseLocation')}</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {t('openingStock.items')}
          </h2>
          <Button variant="ghost" onClick={() => setItems((p) => [...p, { ...EMPTY }])}>
            {t('orders.form.addRow')}
          </Button>
        </div>
        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li
              key={idx}
              className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[1fr_8rem_8rem_1fr_4rem]"
            >
              <ProductPicker
                value={it.productId}
                onChange={(v) => update(idx, { productId: v })}
                ariaLabel={t('openingStock.product', { line: idx + 1 })}
                placeholder={t('orders.form.chooseProduct')}
              />
              <QuantityInput
                value={it.quantity}
                onChange={(v) => update(idx, { quantity: v })}
                min={1}
                aria-label={t('orders.form.quantity')}
                className="w-full"
              />
              <MoneyInput
                label={`${t('orders.form.unitCost')} (${t('common.optional')})`}
                value={it.unitCost}
                onChange={(v) => update(idx, { unitCost: v })}
              />
              <Input
                value={it.notes}
                onChange={(e) => update(idx, { notes: e.target.value })}
                placeholder={t('orders.form.notes')}
              />
              {items.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-xs text-debt-fg hover:underline"
                >
                  {t('common.delete')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{t('openingStock.hint')}</p>
      </div>

      {success ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>
      ) : null}
      {(localError || create.error) ? (
        <p role="alert" className="rounded-md bg-debt-bg p-3 text-sm text-debt-fg">
          {localError ?? (create.error ? errorMessage(create.error, t) : '')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => nav('/settings')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} loading={create.isPending}>
          {t('openingStock.submit')}
        </Button>
      </div>
    </div>
  );
}
