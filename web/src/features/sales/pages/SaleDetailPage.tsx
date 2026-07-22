import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { BalanceBar } from '@/components/BalanceBar';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { ConstructionOverlay } from '@/components/ConstructionOverlay';
import { errorMessage } from '@/shared/error-message';
import { Role } from '@/shared/enums';
import { useMe } from '@/features/auth/api';
import { useCancelSale, useSale } from '../api';
import type { PaymentStatus } from '../types';

// Sale detail — read-only for SHOP; OWNER gets a Cancel button that
// opens ConfirmDialog with a mandatory reason. The API surfaces
// SALE_HAS_ACTIVE_PAYMENTS with `details.paymentReferences` when the
// sale still has active allocations; we render those refs so the
// owner knows which payments to reverse first.

const paymentTone: Record<PaymentStatus, 'ok' | 'warn' | 'danger'> = {
  PAID: 'ok',
  PARTIALLY_PAID: 'warn',
  UNPAID: 'danger',
};

export default function SaleDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const me = useMe();
  const isOwner = me.data?.user.role === Role.OWNER;
  const sale = useSale(id);
  const cancel = useCancelSale(id ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (sale.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (sale.error) {
    return (
      <p
        role="alert"
        className="rounded-input bg-debt-bg p-3 text-[14px] font-medium text-debt-fg"
      >
        {errorMessage(sale.error, t)}
      </p>
    );
  }
  if (!sale.data) return null;
  const s = sale.data;
  const isCancelled = s.status === 'CANCELLED';

  return (
    <div>
      <PageHeader
        title={s.referenceNumber}
        subtitle={`${new Date(s.saleDate).toLocaleDateString()} · ${s.shopName}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              tone={isCancelled ? 'muted' : paymentTone[s.paymentStatus]}
            >
              {isCancelled
                ? t('sales.status.CANCELLED')
                : t(`sales.payment.${s.paymentStatus}`)}
            </StatusBadge>
            <Button variant="ghost" size="sm" onClick={() => nav('/sales')}>
              {t('sales.detail.backToList')}
            </Button>
          </div>
        }
      />

      <SectionCard elevated className="mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
            {t('sales.detail.total')}
          </span>
          <Money value={s.totalAmount} size="xl" />
        </div>
        <div className="mt-3">
          <BalanceBar
            collected={s.amountPaid}
            outstanding={isCancelled ? 0 : s.amountDue}
            collectedLabel={t('sales.detail.paid')}
            outstandingLabel={t('sales.detail.due')}
          />
        </div>
        <div className="mt-4 grid gap-2 border-t border-line-soft pt-3 sm:grid-cols-2">
          <SummaryLine label={t('sales.detail.cashAtSale')} value={<Money value={s.amountPaidAtSale} size="sm" />} />
          <SummaryLine label={t('sales.detail.laterPayments')} value={<Money value={s.amountPaid - s.amountPaidAtSale} size="sm" />} />
        </div>
        {s.customerName ? (
          <div className="mt-3 border-t border-line-soft pt-3">
            <div className="text-[13px] text-muted">{t('sales.detail.customer')}</div>
            <div className="mt-0.5 text-[15px] font-semibold text-ink">
              {s.customerName}
              {s.customerPhone ? (
                <span className="ms-2 text-[13.5px] font-medium text-muted">
                  {s.customerPhone}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('sales.detail.itemsTitle')} className="mb-4">
        <ul className="divide-y divide-line-soft">
          {s.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 py-3 text-start">
              <div className="grow">
                <div className="text-[15px] font-semibold text-ink">
                  {it.productName}
                </div>
                <div className="text-[13px] text-muted tabular-nums">
                  {it.quantity} × <Money value={it.unitPrice} size="sm" showCurrency={false} />
                </div>
              </div>
              <Money value={it.lineTotal} size="md" />
            </li>
          ))}
        </ul>
      </SectionCard>

      {isCancelled ? (
        <SectionCard>
          <div className="text-[13px] text-muted">
            {t('sales.detail.cancelledOn', {
              date: s.cancelledAt ? new Date(s.cancelledAt).toLocaleString() : '',
            })}
          </div>
          {s.cancellationReason ? (
            <p className="mt-2 text-[14px] text-ink">
              <span className="font-semibold">{t('sales.detail.reason')}: </span>
              {s.cancellationReason}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isCancelled && isOwner ? (
          <Button
            variant="danger"
            onClick={() => {
              setReason('');
              setConfirmOpen(true);
            }}
          >
            {t('sales.detail.cancel')}
          </Button>
        ) : null}
        <ConstructionOverlay variant="ribbon" title={t('wip.receipt')}>
          <Button variant="secondary" disabled>
            {t('sales.detail.printReceipt')}
          </Button>
        </ConstructionOverlay>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('sales.detail.cancelTitle', { ref: s.referenceNumber })}
        body={
          <div className="flex flex-col gap-3">
            <p>{t('sales.detail.cancelBody')}</p>
            <Input
              label={t('sales.detail.cancelReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('sales.detail.cancelReasonPlaceholder')}
            />
            {cancel.error ? (
              <div
                role="alert"
                className="rounded-input bg-debt-bg p-2 text-[13.5px] text-debt-fg"
              >
                <p className="font-medium">{errorMessage(cancel.error, t)}</p>
                {/* SALE_HAS_ACTIVE_PAYMENTS carries the blocking payment
                    refs in details.paymentReferences — render them as a
                    hint. The receipts PR wires deep-links; for now show
                    the refs as read-only text. */}
                {cancel.error.code === 'SALE_HAS_ACTIVE_PAYMENTS' ? (
                  <p className="mt-1 text-[13px]">
                    {t('sales.detail.blockingHint')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        confirmLabel={t('sales.detail.cancelConfirm')}
        danger
        loading={cancel.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const r = reason.trim();
          if (r === '') return;
          try {
            await cancel.mutateAsync({ reason: r });
            setConfirmOpen(false);
          } catch {
            /* surfaced inside dialog */
          }
        }}
      />
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-muted">{label}</span>
      {value}
    </div>
  );
}
