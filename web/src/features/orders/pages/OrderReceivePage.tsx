import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { QuantityInput } from '@/components/QuantityInput';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useOrder, useReceiveOrder } from '../api';

// Receive flow (P3-05 UI): rows show ordered · already received · remaining
// with the "receive now" input pre-filled at the remaining quantity — the
// most common case is receiving what's left, and the operator can edit down.

export default function OrderReceivePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useOrder(id);
  const receive = useReceiveOrder(id);
  const [receiptDate, setReceiptDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState('');
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  // Pre-fill the per-line receive input with the remaining quantity as soon
  // as the order arrives.
  useEffect(() => {
    if (!q.data) return;
    const init: Record<string, number | null> = {};
    for (const it of q.data.items) init[it.id] = it.quantityRemaining;
    setAmounts(init);
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <p role="alert" className="p-3 text-sm text-red-700">
        {q.error ? errorMessage(q.error, t) : t('errors.NOT_FOUND')}
      </p>
    );
  }
  const o = q.data;
  if (o.status === 'RECEIVED' || o.status === 'CANCELLED') {
    return (
      <p className="p-3 text-sm text-slate-700">
        {t('orders.receive.notEditable', { status: t(`orders.status.${o.status}`) })}
      </p>
    );
  }

  const onSubmit = async () => {
    setLocalError(null);
    const items = o.items
      .map((it) => ({ orderItemId: it.id, quantity: amounts[it.id] ?? 0 }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) {
      setLocalError(t('orders.receive.errors.empty'));
      return;
    }
    for (const line of items) {
      const it = o.items.find((x) => x.id === line.orderItemId);
      if (!it) continue;
      if (line.quantity > it.quantityRemaining) {
        setLocalError(
          t('orders.receive.errors.exceeds', {
            product: it.productName,
            max: it.quantityRemaining,
          }),
        );
        return;
      }
    }
    try {
      await receive.mutateAsync({
        receiptDate: new Date(receiptDate).toISOString(),
        notes: notes.trim() || null,
        items,
      });
      nav(`/orders/${id}`, { replace: true });
    } catch {
      /* surfaced via receive.error */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('orders.receive.title')}
        subtitle={t('orders.receive.subtitle', { ref: o.referenceNumber })}
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">
            {t('orders.receive.receiptDate')}
          </span>
          <Input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">{t('orders.form.notes')}</span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">
          {t('orders.receive.items')}
        </h2>
        <ul className="divide-y divide-slate-100">
          {o.items.map((it) => (
            <li
              key={it.id}
              className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_6rem_6rem_6rem_7rem] md:items-center md:gap-3"
            >
              <div className="text-slate-900">{it.productName}</div>
              <div className="text-end text-xs tabular-nums text-slate-500">
                {t('orders.detail.ordered')}: {it.quantityOrdered}
              </div>
              <div className="text-end text-xs tabular-nums text-slate-500">
                {t('orders.detail.received')}: {it.quantityReceived}
              </div>
              <div className="text-end text-xs tabular-nums text-amber-700">
                {t('orders.detail.remaining')}: {it.quantityRemaining}
              </div>
              <QuantityInput
                value={amounts[it.id] ?? null}
                onChange={(v) =>
                  setAmounts((prev) => ({ ...prev, [it.id]: v }))
                }
                min={0}
                max={it.quantityRemaining}
                aria-label={t('orders.receive.amountFor', { product: it.productName })}
                disabled={it.quantityRemaining === 0}
                className="w-full"
              />
            </li>
          ))}
        </ul>
      </div>

      {(localError || receive.error) ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {localError ?? (receive.error ? errorMessage(receive.error, t) : '')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => nav(`/orders/${id}`)}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSubmit} loading={receive.isPending}>
          {t('orders.receive.confirm')}
        </Button>
      </div>
    </div>
  );
}
