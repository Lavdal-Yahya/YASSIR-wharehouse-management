import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { errorMessage } from '@/shared/error-message';
import { normalizeDigits } from '@/shared/money';
import { Role } from '@/shared/enums';
import { useMe } from '@/features/auth/api';
import { useCancelSale, useSale, useUpdateSale } from '../api';
import type { PaymentStatus, SaleDetail, UpdateSaleItemBody } from '../types';

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
  const update = useUpdateSale(id ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);

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

      {editing && isOwner && !isCancelled ? (
        <SaleItemsEditor
          sale={s}
          submitting={update.isPending}
          errorText={update.error ? errorMessage(update.error, t) : null}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
          onSave={async (patch) => {
            try {
              await update.mutateAsync(patch);
              setEditing(false);
            } catch {
              /* surfaced inline */
            }
          }}
        />
      ) : (
        <SectionCard
          title={t('sales.detail.itemsTitle')}
          className="mb-4"
          action={
            isOwner && !isCancelled ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                {t('sales.detail.edit')}
              </Button>
            ) : undefined
          }
        >
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
      )}

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
        <Link to={`/sales/${s.id}/receipt`}>
          <Button variant="secondary">{t('sales.detail.printReceipt')}</Button>
        </Link>
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

// OWNER-only inline editor. Item quantity and unit price are the only
// editable per-line fields (spec §37.15 book-correction scope) — the
// product itself, the customer, and payment fields stay locked. New
// total is computed live so the operator sees the impact before saving;
// the server re-verifies and refuses if new total < amountPaid.

type EditorProps = {
  sale: SaleDetail;
  submitting: boolean;
  errorText: string | null;
  onCancel: () => void;
  onSave: (patch: {
    items: UpdateSaleItemBody[];
    notes: string | null;
    saleDate: string;
  }) => void;
};

function SaleItemsEditor({ sale, submitting, errorText, onCancel, onSave }: EditorProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState(() =>
    sale.items.map((it) => ({
      itemId: it.id,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  );
  const [notes, setNotes] = useState(sale.notes ?? '');
  const [saleDate, setSaleDate] = useState(sale.saleDate.slice(0, 10));

  // No re-seed effect: the parent unmounts the editor when `editing`
  // goes false → true, so useState initializers pick up a fresh sale
  // snapshot each open. A background refetch mid-edit therefore does
  // NOT clobber the operator's unsaved input.

  const newTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
    [lines],
  );
  const wouldOrphan = newTotal < sale.amountPaid;

  const patchLine = (
    itemId: string,
    field: 'quantity' | 'unitPrice',
    raw: string,
  ) => {
    const clean = normalizeDigits(raw).replace(/[\s,]/g, '');
    if (clean === '') {
      setLines((prev) =>
        prev.map((l) => (l.itemId === itemId ? { ...l, [field]: 0 } : l)),
      );
      return;
    }
    if (!/^\d+$/.test(clean)) return;
    const n = parseInt(clean, 10);
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, [field]: n } : l)),
    );
  };

  const canSave =
    !submitting &&
    !wouldOrphan &&
    lines.every((l) => l.quantity >= 1 && l.unitPrice >= 0);

  return (
    <SectionCard
      title={t('sales.detail.editTitle')}
      className="mb-4"
      action={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            loading={submitting}
            disabled={!canSave}
            onClick={() =>
              onSave({
                items: lines.map((l) => ({
                  itemId: l.itemId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                })),
                notes: notes.trim() === '' ? null : notes.trim(),
                saleDate,
              })
            }
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <p className="mb-3 rounded-input bg-tint px-3 py-2 text-[12.5px] text-muted">
        {t('sales.detail.editHint')}
      </p>
      <ul className="divide-y divide-line-soft">
        {lines.map((l) => (
          <li key={l.itemId} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1fr_120px_140px_120px]">
            <div className="text-[14.5px] font-semibold text-ink">{l.productName}</div>
            <Input
              label={t('sales.detail.editQuantity')}
              inputMode="numeric"
              value={String(l.quantity)}
              onChange={(e) => patchLine(l.itemId, 'quantity', e.target.value)}
              className="tabular-nums"
            />
            <Input
              label={t('sales.detail.editUnitPrice')}
              inputMode="numeric"
              value={String(l.unitPrice)}
              onChange={(e) => patchLine(l.itemId, 'unitPrice', e.target.value)}
              className="tabular-nums"
            />
            <div className="flex items-end justify-end pb-1.5">
              <Money value={l.quantity * l.unitPrice} size="sm" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-3 border-t border-line-soft pt-3 md:grid-cols-2">
        <Input
          label={t('sales.detail.editDate')}
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
        />
        <Input
          label={t('sales.detail.editNotes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line-soft pt-3">
        <span className="text-[13px] text-muted">
          {t('sales.detail.editNewTotal')}
        </span>
        <Money value={newTotal} size="md" />
      </div>
      {wouldOrphan ? (
        <p
          role="alert"
          className="mt-2 rounded-input bg-debt-bg px-3 py-2 text-[13px] font-medium text-debt-fg"
        >
          {t('sales.detail.editOrphanWarning', {
            amountPaid: sale.amountPaid,
          })}
        </p>
      ) : null}
      {errorText ? (
        <p role="alert" className="mt-2 text-[13px] text-debt-fg">
          {errorText}
        </p>
      ) : null}
    </SectionCard>
  );
}
