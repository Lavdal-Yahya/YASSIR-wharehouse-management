import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { Money } from '@/components/Money';
import { errorMessage } from '@/shared/error-message';
import { useReceipt } from '../api';

export default function ReceiptDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useReceipt(id);

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
  const r = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={r.referenceNumber}
        subtitle={
          r.incomingOrderReference
            ? t('receipts.detail.fromOrder', { ref: r.incomingOrderReference })
            : t('receipts.detail.direct')
        }
      />

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm md:grid-cols-3 text-sm text-ink">
        <div>
          <div className="text-xs text-muted">{t('receipts.direct.receiptDate')}</div>
          <div>{new Date(r.receiptDate).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('orders.form.supplier')}</div>
          <div>{r.supplierName ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('orders.form.notes')}</div>
          <div>{r.notes || '—'}</div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-sm">
        <h2 className="border-b border-line-soft p-4 text-sm font-semibold text-ink">
          {t('receipts.direct.items')}
        </h2>
        <ul className="divide-y divide-line-soft">
          {r.items.map((it) => (
            <li
              key={it.id}
              className="grid gap-1 p-4 text-sm text-ink md:grid-cols-[1fr_6rem_7rem] md:items-center md:gap-3"
            >
              <div className="text-ink">{it.productName}</div>
              <div className="text-end tabular-nums">{it.quantity}</div>
              <div className="text-end text-xs text-muted">
                {it.unitCost !== null ? (
                  <Money value={it.unitCost} size="sm" />
                ) : (
                  '—'
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-start">
        <Button variant="ghost" onClick={() => nav('/warehouse/receipts')}>
          ← {t('receipts.backToList')}
        </Button>
        {r.incomingOrderId ? (
          <Link to={`/orders/${r.incomingOrderId}`} className="ms-3">
            <Button variant="ghost">{t('receipts.viewOrder')}</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
