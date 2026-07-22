import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { errorMessage } from '@/shared/error-message';
import { useMe } from '@/features/auth/api';
import { Role } from '@/shared/enums';
import { useReverseTransfer, useTransfer } from '../api';
import type { TransferStatus } from '../types';

const toneFor = (s: TransferStatus): 'ok' | 'muted' =>
  s === 'COMPLETED' ? 'ok' : 'muted';

export default function TransferDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useTransfer(id);
  const reverse = useReverseTransfer(id);
  const me = useMe();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

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
  const tr = q.data;
  const isOwner = me.data?.user.role === Role.OWNER;
  const canReverse = isOwner && tr.status === 'COMPLETED';

  const onConfirmReverse = async () => {
    if (!reason.trim()) {
      setReasonError(t('transfers.reverse.reasonRequired'));
      return;
    }
    setReasonError(null);
    try {
      await reverse.mutateAsync({ reason: reason.trim() });
      setConfirm(false);
      setReason('');
    } catch {
      /* surfaced via reverse.error */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={tr.referenceNumber}
        subtitle={`${tr.sourceLocationName} → ${tr.destinationLocationName}`}
        actions={
          <div className="flex gap-2">
            <StatusBadge tone={toneFor(tr.status)}>
              {t(`transfers.status.${tr.status}`)}
            </StatusBadge>
            {canReverse ? (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                {t('transfers.reverse.button')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 rounded-lg border border-line bg-white p-4 shadow-sm md:grid-cols-3 text-sm text-ink">
        <div>
          <div className="text-xs text-muted">{t('transfers.detail.source')}</div>
          <div>{tr.sourceLocationName}</div>
        </div>
        <div>
          <div className="text-xs text-muted">
            {t('transfers.detail.destination')}
          </div>
          <div>{tr.destinationLocationName}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('transfers.detail.date')}</div>
          <div>{new Date(tr.transferDate).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-xs text-muted">
            {t('transfers.detail.createdBy')}
          </div>
          <div>{tr.createdBy}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-muted">{t('transfers.detail.notes')}</div>
          <div>{tr.notes || '—'}</div>
        </div>
        {tr.status === 'REVERSED' ? (
          <>
            <div>
              <div className="text-xs text-muted">
                {t('transfers.detail.reversedBy')}
              </div>
              <div>{tr.reversedBy || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">
                {t('transfers.detail.reversedAt')}
              </div>
              <div>
                {tr.reversedAt
                  ? new Date(tr.reversedAt).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">
                {t('transfers.detail.reversalReason')}
              </div>
              <div className="text-debt-fg">{tr.reversalReason || '—'}</div>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white shadow-sm">
        <h2 className="border-b border-line-soft p-4 text-sm font-semibold text-ink">
          {t('transfers.detail.items')}
        </h2>
        <ul className="divide-y divide-line-soft">
          {tr.items.map((it) => (
            <li
              key={it.id}
              className="grid gap-1 p-4 text-sm text-ink md:grid-cols-[1fr_6rem] md:items-center md:gap-3"
            >
              <div className="text-ink">
                <Link
                  to={`/warehouse/movements?productId=${it.productId}`}
                  className="hover:underline"
                >
                  {it.productName}
                </Link>
              </div>
              <div className="text-end tabular-nums">{it.quantity}</div>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirm}
        onCancel={() => {
          setConfirm(false);
          setReason('');
          setReasonError(null);
        }}
        onConfirm={onConfirmReverse}
        title={t('transfers.reverse.title')}
        confirmLabel={t('transfers.reverse.confirm')}
        danger
        loading={reverse.isPending}
        body={
          <>
            <p className="mb-2 text-sm text-ink">
              {t('transfers.reverse.body')}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-ink">
                {t('transfers.reverse.reason')}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t('transfers.reverse.reasonPlaceholder')}
                className="block w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
              />
            </label>
            {reasonError ? (
              <p role="alert" className="mt-2 text-sm text-debt-fg">
                {reasonError}
              </p>
            ) : null}
            {reverse.error ? (
              <p role="alert" className="mt-2 text-sm text-debt-fg">
                {errorMessage(reverse.error, t)}
              </p>
            ) : null}
          </>
        }
      />

      <div className="flex justify-start">
        <Button variant="ghost" onClick={() => nav('/transfers')}>
          ← {t('transfers.backToList')}
        </Button>
      </div>
    </div>
  );
}
