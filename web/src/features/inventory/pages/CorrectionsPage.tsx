import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { QuantityInput } from '@/components/QuantityInput';
import { ProductPicker } from '@/components/ProductPicker';
import { Pagination } from '@/components/Pagination';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useLocationsList } from '@/features/locations/api';
import { useCreateCorrection, useStockCorrectionsList } from '../api';

// Corrections (spec §28, P3-09 UI). List + inline creation. Reason required
// — the audit trail is the whole point (this is the shrinkage/damage log).

export default function CorrectionsPage() {
  const { t } = useTranslation();
  const locations = useLocationsList();
  const create = useCreateCorrection();
  const [page, setPage] = useState(1);
  const list = useStockCorrectionsList({ page, pageSize: 25 });

  const [locationId, setLocationId] = useState('');
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async () => {
    setLocalError(null);
    if (!locationId) return setLocalError(t('corrections.errors.location'));
    if (!productId) return setLocalError(t('corrections.errors.product'));
    if (!amount || amount === 0) return setLocalError(t('corrections.errors.amount'));
    if (!reason.trim()) return setLocalError(t('corrections.errors.reason'));
    try {
      await create.mutateAsync({
        locationId,
        productId,
        adjustmentQuantity: amount,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });
      setProductId('');
      setAmount(null);
      setReason('');
      setNotes('');
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corrections.title')}
        subtitle={t('corrections.subtitle')}
      />

      <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {t('corrections.form.title')}
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
            aria-label={t('corrections.form.location')}
          >
            <option value="">{t('corrections.form.chooseLocation')}</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <ProductPicker
            value={productId}
            onChange={setProductId}
            ariaLabel={t('corrections.form.product')}
            placeholder={t('orders.form.chooseProduct')}
          />
          <QuantityInput
            value={amount}
            onChange={setAmount}
            min={-1_000_000}
            aria-label={t('corrections.form.amount')}
            placeholder={t('corrections.form.amountHint')}
            className="w-full"
          />
          <Button onClick={onSubmit} loading={create.isPending}>
            {t('corrections.form.submit')}
          </Button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('corrections.form.reason')}
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`${t('orders.form.notes')} (${t('common.optional')})`}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {t('corrections.form.hint')}
        </p>
        {(localError || create.error) ? (
          <p role="alert" className="mt-3 rounded-md bg-debt-bg p-2 text-sm text-debt-fg">
            {localError ?? (create.error ? errorMessage(create.error, t) : '')}
          </p>
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
            {list.data?.items.map((c) => (
              <li
                key={c.id}
                className="grid gap-1 p-3 text-sm md:grid-cols-[7rem_1fr_1fr_5rem] md:items-center md:gap-3"
              >
                <div className="text-xs tabular-nums text-muted">
                  {c.referenceNumber}
                </div>
                <div className="text-ink">
                  {c.productName}
                  <div className="text-xs text-muted">{c.locationName}</div>
                </div>
                <div className="text-xs text-muted">{c.reason}</div>
                <div
                  className={`text-end text-sm font-semibold tabular-nums ${
                    c.adjustmentQuantity > 0 ? 'text-emerald-700' : 'text-debt-fg'
                  }`}
                >
                  {c.adjustmentQuantity > 0 ? `＋${c.adjustmentQuantity}` : c.adjustmentQuantity}
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
    </div>
  );
}
