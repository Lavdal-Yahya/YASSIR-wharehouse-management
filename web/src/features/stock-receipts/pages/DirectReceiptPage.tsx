import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { QuantityInput } from '@/components/QuantityInput';
import { ProductPicker } from '@/components/ProductPicker';
import { MoneyInput } from '@/components/MoneyInput';
import { errorMessage } from '@/shared/error-message';
import { useCreateDirectReceipt } from '../api';

// Direct warehouse receipt (spec §12, P3-07 UI). Multi-item, same feel as
// order create; no supplier/order linking — just what came in.

type DraftItem = {
  productId: string;
  quantity: number | null;
  unitCost: number | null;
};

const EMPTY: DraftItem = { productId: '', quantity: null, unitCost: null };

export default function DirectReceiptPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const create = useCreateDirectReceipt();
  const [receiptDate, setReceiptDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY }]);
  const [localError, setLocalError] = useState<string | null>(null);

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const onSubmit = async () => {
    setLocalError(null);
    const validItems: Array<{
      productId: string;
      quantity: number;
      unitCost?: number;
    }> = [];
    for (const [i, it] of items.entries()) {
      if (!it.productId) {
        setLocalError(t('receipts.direct.errors.product', { line: i + 1 }));
        return;
      }
      if (!it.quantity || it.quantity < 1) {
        setLocalError(t('receipts.direct.errors.quantity', { line: i + 1 }));
        return;
      }
      validItems.push({
        productId: it.productId,
        quantity: it.quantity,
        unitCost: it.unitCost ?? undefined,
      });
    }
    try {
      const created = await create.mutateAsync({
        receiptDate: new Date(receiptDate).toISOString(),
        supplierName: supplierName.trim() || null,
        notes: notes.trim() || null,
        items: validItems,
      });
      nav(`/warehouse/receipts/${created.id}`, { replace: true });
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('receipts.direct.title')}
        subtitle={t('receipts.direct.subtitle')}
      />

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('receipts.direct.receiptDate')}
          </span>
          <Input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('orders.form.supplier')}
          </span>
          <Input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={t('common.optional')}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink">{t('orders.form.notes')}</span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {t('receipts.direct.items')}
          </h2>
          <Button variant="ghost" onClick={() => setItems((p) => [...p, { ...EMPTY }])}>
            {t('orders.form.addRow')}
          </Button>
        </div>
        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li
              key={idx}
              className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_10rem_10rem_4rem]"
            >
              <ProductPicker
                value={it.productId}
                onChange={(v) => update(idx, { productId: v })}
                ariaLabel={t('receipts.direct.product', { line: idx + 1 })}
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
      </div>

      {(localError || create.error) ? (
        <p role="alert" className="rounded-md bg-debt-bg p-3 text-sm text-debt-fg">
          {localError ?? (create.error ? errorMessage(create.error, t) : '')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => nav('/warehouse')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} loading={create.isPending}>
          {t('receipts.direct.submit')}
        </Button>
      </div>
    </div>
  );
}
