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

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 text-sm text-slate-700">
        <div>
          <div className="text-xs text-slate-500">{t('transfers.detail.source')}</div>
          <div>{tr.sourceLocationName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">
            {t('transfers.detail.destination')}
          </div>
          <div>{tr.destinationLocationName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{t('transfers.detail.date')}</div>
          <div>{new Date(tr.transferDate).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">
            {t('transfers.detail.createdBy')}
          </div>
          <div>{tr.createdBy}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-slate-500">{t('transfers.detail.notes')}</div>
          <div>{tr.notes || '—'}</div>
        </div>
        {tr.status === 'REVERSED' ? (
          <>
            <div>
              <div className="text-xs text-slate-500">
                {t('transfers.detail.reversedBy')}
              </div>
              <div>{tr.reversedBy || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">
                {t('transfers.detail.reversedAt')}
              </div>
              <div>
                {tr.reversedAt
                  ? new Date(tr.reversedAt).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">
                {t('transfers.detail.reversalReason')}
              </div>
              <div className="text-red-700">{tr.reversalReason || '—'}</div>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">
          {t('transfers.detail.items')}
        </h2>
        <ul className="divide-y divide-slate-100">
          {tr.items.map((it) => (
            <li
              key={it.id}
              className="grid gap-1 p-4 text-sm text-slate-700 md:grid-cols-[1fr_6rem] md:items-center md:gap-3"
            >
              <div className="text-slate-900">
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
            <p className="mb-2 text-sm text-slate-700">
              {t('transfers.reverse.body')}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">
                {t('transfers.reverse.reason')}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t('transfers.reverse.reasonPlaceholder')}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            {reasonError ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {reasonError}
              </p>
            ) : null}
            {reverse.error ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
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
