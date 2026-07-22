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
import { useCategoriesList } from '@/features/categories/api';
import { useCreateOrder } from '../api';
import type { CreateOrderBody, CreateOrderItemBody } from '../types';

// Draft row: either existing product OR inline new product. We keep them in
// one shape here and split into the union at submit time.
type DraftItem = {
  mode: 'existing' | 'new';
  productId: string;
  quantityOrdered: number | null;
  unitCost: number | null;
  newProductName: string;
  newProductCategoryId: string;
};

const EMPTY_ITEM: DraftItem = {
  mode: 'existing',
  productId: '',
  quantityOrdered: null,
  unitCost: null,
  newProductName: '',
  newProductCategoryId: '',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OrderNewPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const cats = useCategoriesList({ page: 1, pageSize: 100 });
  const create = useCreateOrder();

  const [supplierName, setSupplierName] = useState('');
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [localError, setLocalError] = useState<string | null>(null);

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const addRow = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const onSubmit = async () => {
    setLocalError(null);
    // Client-side pre-validation. The server is the authority.
    const bodyItems: CreateOrderItemBody[] = [];
    for (const [i, it] of items.entries()) {
      if (!it.quantityOrdered || it.quantityOrdered < 1) {
        setLocalError(t('orders.form.errors.itemQuantity', { line: i + 1 }));
        return;
      }
      if (it.mode === 'existing') {
        if (!it.productId) {
          setLocalError(t('orders.form.errors.itemProduct', { line: i + 1 }));
          return;
        }
        bodyItems.push({
          productId: it.productId,
          quantityOrdered: it.quantityOrdered,
          unitCost: it.unitCost ?? undefined,
        });
      } else {
        if (!it.newProductName.trim() || !it.newProductCategoryId) {
          setLocalError(t('orders.form.errors.itemNewProduct', { line: i + 1 }));
          return;
        }
        bodyItems.push({
          newProduct: {
            name: it.newProductName.trim(),
            categoryId: it.newProductCategoryId,
          },
          quantityOrdered: it.quantityOrdered,
          unitCost: it.unitCost ?? undefined,
        });
      }
    }

    const body: CreateOrderBody = {
      supplierName: supplierName.trim() || null,
      orderDate: new Date(orderDate).toISOString(),
      expectedArrivalDate: expectedArrivalDate
        ? new Date(expectedArrivalDate).toISOString()
        : undefined,
      notes: notes.trim() || null,
      items: bodyItems,
    };
    try {
      const created = await create.mutateAsync(body);
      nav(`/orders/${created.id}`, { replace: true });
    } catch {
      /* surfaced via create.error below */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('orders.form.newTitle')}
        subtitle={t('orders.form.newSubtitle')}
      />

      <div className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink">{t('orders.form.supplier')}</span>
          <Input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={t('common.optional')}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink">{t('orders.form.orderDate')}</span>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink">
            {t('orders.form.expectedArrivalDate')}
          </span>
          <Input
            type="date"
            value={expectedArrivalDate}
            onChange={(e) => setExpectedArrivalDate(e.target.value)}
          />
        </label>
        <label className="block text-sm md:col-span-3">
          <span className="mb-1 block text-ink">{t('orders.form.notes')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="block w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {t('orders.form.items')}
          </h2>
          <Button variant="ghost" onClick={addRow}>
            {t('orders.form.addRow')}
          </Button>
        </div>

        <ul className="space-y-4">
          {items.map((it, idx) => (
            <li key={idx} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-muted">
                  {t('orders.form.line', { n: idx + 1 })}
                </div>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-xs text-debt-fg hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                ) : null}
              </div>

              <div className="mb-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => updateItem(idx, { mode: 'existing' })}
                  className={`rounded-md border px-2 py-1 ${
                    it.mode === 'existing'
                      ? 'border-slate-900 bg-brand-pressed text-white'
                      : 'border-line bg-white text-ink'
                  }`}
                >
                  {t('orders.form.existingProduct')}
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(idx, { mode: 'new' })}
                  className={`rounded-md border px-2 py-1 ${
                    it.mode === 'new'
                      ? 'border-slate-900 bg-brand-pressed text-white'
                      : 'border-line bg-white text-ink'
                  }`}
                >
                  {t('orders.form.newProduct')}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_10rem_10rem]">
                {it.mode === 'existing' ? (
                  <ProductPicker
                    value={it.productId}
                    onChange={(v) => updateItem(idx, { productId: v })}
                    ariaLabel={t('orders.form.product')}
                    placeholder={t('orders.form.chooseProduct')}
                  />
                ) : (
                  <div className="grid gap-2">
                    <Input
                      value={it.newProductName}
                      onChange={(e) =>
                        updateItem(idx, { newProductName: e.target.value })
                      }
                      placeholder={t('orders.form.newProductName')}
                    />
                    <select
                      value={it.newProductCategoryId}
                      onChange={(e) =>
                        updateItem(idx, { newProductCategoryId: e.target.value })
                      }
                      aria-label={t('orders.form.category')}
                      className="w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
                    >
                      <option value="">{t('orders.form.chooseCategory')}</option>
                      {cats.data?.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">
                    {t('orders.form.quantity')}
                  </span>
                  <QuantityInput
                    value={it.quantityOrdered}
                    onChange={(v) => updateItem(idx, { quantityOrdered: v })}
                    min={1}
                    className="w-full"
                  />
                </label>
                <MoneyInput
                  label={`${t('orders.form.unitCost')} (${t('common.optional')})`}
                  value={it.unitCost}
                  onChange={(v) => updateItem(idx, { unitCost: v })}
                />

              </div>
            </li>
          ))}
        </ul>
      </div>

      {(localError || create.error) ? (
        <p role="alert" className="rounded-md bg-debt-bg p-3 text-sm text-debt-fg">
          {localError ?? (create.error ? errorMessage(create.error, t) : '')}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => nav('/orders')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} loading={create.isPending}>
          {t('orders.form.submit')}
        </Button>
      </div>
    </div>
  );
}
