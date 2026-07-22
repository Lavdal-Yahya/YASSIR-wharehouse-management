import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { errorMessage } from '@/shared/error-message';
import { formatMoney } from '@/shared/money';
import { useCancelOrder, useOrder } from '../api';
import type { OrderStatus } from '../types';

const toneFor = (s: OrderStatus): 'ok' | 'warn' | 'muted' | 'danger' => {
  switch (s) {
    case 'RECEIVED':
      return 'ok';
    case 'PARTIALLY_RECEIVED':
    case 'SHIPPED':
      return 'warn';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'muted';
  }
};

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useOrder(id);
  const cancel = useCancelOrder(id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <p role="alert" className="p-3 text-sm text-debt-fg">
        {q.error ? errorMessage(q.error, t) : t('errors.NOT_FOUND')}
      </p>
    );
  }
  const o = q.data;
  const canAct = o.status !== 'RECEIVED' && o.status !== 'CANCELLED';

  const onCancelSubmit = async () => {
    if (!reason.trim()) return;
    try {
      await cancel.mutateAsync({ reason: reason.trim() });
      setConfirmCancel(false);
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={o.referenceNumber}
        subtitle={o.supplierName ?? t('orders.noSupplier')}
        actions={
          <div className="flex gap-2">
            <StatusBadge tone={toneFor(o.status)}>
              {t(`orders.status.${o.status}`)}
            </StatusBadge>
            {canAct ? (
              <Link to={`/orders/${o.id}/receive`}>
                <Button>{t('orders.actions.receive')}</Button>
              </Link>
            ) : null}
            {canAct ? (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                {t('orders.actions.cancel')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm md:grid-cols-3 text-sm text-ink">
        <div>
          <div className="text-xs text-muted">{t('orders.form.orderDate')}</div>
          <div>{new Date(o.orderDate).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted">
            {t('orders.form.expectedArrivalDate')}
          </div>
          <div>
            {o.expectedArrivalDate
              ? new Date(o.expectedArrivalDate).toLocaleDateString()
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('orders.form.notes')}</div>
          <div>{o.notes || '—'}</div>
        </div>
        {o.cancellationReason ? (
          <div className="md:col-span-3">
            <div className="text-xs text-muted">{t('orders.cancelReason')}</div>
            <div className="text-debt-fg">{o.cancellationReason}</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white shadow-sm">
        <h2 className="border-b border-line-soft p-4 text-sm font-semibold text-ink">
          {t('orders.detail.items')}
        </h2>
        <ul className="divide-y divide-line-soft">
          {o.items.map((it) => (
            <li
              key={it.id}
              className="grid gap-1 p-4 text-sm text-ink md:grid-cols-[1fr_6rem_6rem_6rem_7rem] md:items-center md:gap-3"
            >
              <div className="text-ink">{it.productName}</div>
              <div className="text-end tabular-nums">
                <span className="text-xs text-muted">
                  {t('orders.detail.ordered')}:{' '}
                </span>
                {it.quantityOrdered}
              </div>
              <div className="text-end tabular-nums">
                <span className="text-xs text-muted">
                  {t('orders.detail.received')}:{' '}
                </span>
                {it.quantityReceived}
              </div>
              <div className="text-end tabular-nums text-amber-700">
                <span className="text-xs text-muted">
                  {t('orders.detail.remaining')}:{' '}
                </span>
                {it.quantityRemaining}
              </div>
              <div className="text-end text-xs text-muted">
                {it.unitCost !== null ? formatMoney(it.unitCost) : '—'}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {o.receipts.length > 0 ? (
        <div className="rounded-lg border border-line bg-white shadow-sm">
          <h2 className="border-b border-line-soft p-4 text-sm font-semibold text-ink">
            {t('orders.detail.receipts')}
          </h2>
          <ul className="divide-y divide-line-soft">
            {o.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-4 text-sm">
                <Link
                  to={`/warehouse/receipts/${r.id}`}
                  className="text-ink hover:underline"
                >
                  {r.referenceNumber}
                </Link>
                <span className="text-muted">
                  {new Date(r.receiptDate).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={onCancelSubmit}
        title={t('orders.cancelConfirm.title')}
        confirmLabel={t('orders.actions.cancel')}
        danger
        loading={cancel.isPending}
        body={
          <>
            <p className="mb-2 text-sm text-ink">
              {t('orders.cancelConfirm.body', { ref: o.referenceNumber })}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-ink">
                {t('orders.cancelReason')}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
              />
            </label>
            {cancel.error ? (
              <p role="alert" className="mt-2 text-sm text-debt-fg">
                {errorMessage(cancel.error, t)}
              </p>
            ) : null}
          </>
        }
      />


      <div className="flex justify-start">
        <Button variant="ghost" onClick={() => nav('/orders')}>
          ← {t('orders.backToList')}
        </Button>
      </div>
    </div>
  );
}
