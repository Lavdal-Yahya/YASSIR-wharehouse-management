import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { Role } from '@/shared/enums';
import { useMe } from '@/features/auth/api';
import { useCustomer, useCustomerSummary } from '../api';
import { useSalesList } from '@/features/sales/api';
import { usePaymentsList, useReversePayment } from '@/features/payments/api';
import type { Payment } from '@/features/payments/types';

export default function CustomerAccountPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const isOwner = me.data?.user.role === Role.OWNER;

  const customer = useCustomer(id);
  const summary = useCustomerSummary(id);
  const unpaidSales = useSalesList({
    customerId: id,
    paymentStatus: ['UNPAID', 'PARTIALLY_PAID'],
    pageSize: 50,
  });
  const payments = usePaymentsList({ customerId: id, pageSize: 50 });
  const reverse = useReversePayment();

  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  if (customer.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (customer.error) {
    return (
      <p role="alert" className="rounded-input bg-debt-bg p-3 text-[14px] font-medium text-debt-fg">
        {errorMessage(customer.error, t)}
      </p>
    );
  }
  if (!customer.data) return null;

  const c = customer.data;
  const s = summary.data;
  const outstanding = s?.outstanding ?? 0;

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={c.phone ?? t('customers.account.noPhone')}
        actions={
          <Link to="/customers">
            <Button variant="secondary" size="sm">
              {t('customers.account.backToList')}
            </Button>
          </Link>
        }
      />

      {/* Account summary — BalanceBar + 3 stat cells */}
      <SectionCard elevated className="mb-4">
        {s ? (
          <>
            <BalanceBar
              collected={s.totalPaid}
              outstanding={s.outstanding}
              collectedLabel={t('customers.account.totalPaid')}
              outstandingLabel={t('customers.account.outstanding')}
            />
            <div className="mt-4 grid grid-cols-3 divide-x divide-line-soft border-t border-line-soft pt-3">
              <StatCell label={t('customers.account.totalPurchases')} value={<Money value={s.totalPurchases} size="sm" />} />
              <StatCell label={t('customers.account.totalPaid')} value={<Money value={s.totalPaid} size="sm" />} />
              <StatCell label={t('customers.account.outstanding')} value={<Money value={s.outstanding} size="sm" />} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[14px] text-muted">
            <Spinner />
          </div>
        )}
      </SectionCard>

      {/* Unpaid / partial sales */}
      <SectionCard
        title={t('customers.account.unpaidSales')}
        action={
          outstanding > 0 ? (
            <Link to={`/customers/${id}/payments/new`}>
              <Button size="sm">{t('customers.account.registerPayment')}</Button>
            </Link>
          ) : null
        }
        className="mb-4"
      >
        {unpaidSales.isLoading ? (
          <div className="py-2"><Spinner /></div>
        ) : unpaidSales.data?.items.length === 0 ? (
          <p className="text-[14px] text-muted">{t('customers.account.noUnpaidSales')}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {unpaidSales.data?.items.map((sale) => (
              <li
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-start"
              >
                <div className="grow">
                  <div className="text-[14px] font-semibold text-ink">
                    {sale.referenceNumber}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {new Date(sale.saleDate).toLocaleDateString()} · {sale.shopName}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <div className="text-[11px] uppercase tracking-wide text-muted">
                      {t('customers.account.saleAmountDue')}
                    </div>
                    <Money value={sale.amountDue} size="md" />
                  </div>
                  <StatusBadge tone={sale.paymentStatus === 'UNPAID' ? 'danger' : 'warn'}>
                    {t(`sales.payment.${sale.paymentStatus}`)}
                  </StatusBadge>
                  <Link
                    to={`/sales/${sale.id}`}
                    className="text-[12.5px] font-medium text-brand hover:underline"
                  >
                    {t('customers.account.viewSale')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Payment history — all statuses, newest first */}
      <SectionCard title={t('customers.account.paymentHistory')}>
        {payments.isLoading ? (
          <div className="py-2"><Spinner /></div>
        ) : payments.data?.items.length === 0 ? (
          <p className="text-[14px] text-muted">{t('customers.account.noPayments')}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {payments.data?.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-start">
                <div className="grow">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">
                      {p.referenceNumber}
                    </span>
                    <StatusBadge tone={p.status === 'ACTIVE' ? 'ok' : 'muted'}>
                      {t(`payment.${p.status}`)}
                    </StatusBadge>
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {new Date(p.paymentDate).toLocaleDateString()} · {p.shopName}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Money value={p.amount} size="md" />
                  <Link
                    to={`/payments/${p.id}/receipt`}
                    className="text-[12.5px] font-medium text-brand hover:underline"
                  >
                    {t('customers.account.viewReceipt')}
                  </Link>
                  {isOwner && p.status === 'ACTIVE' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReverseReason('');
                        setReverseTarget(p);
                      }}
                    >
                      {t('payment.reverse.action')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Reversal dialog */}
      <ConfirmDialog
        open={!!reverseTarget}
        title={t('payment.reverse.title', { ref: reverseTarget?.referenceNumber })}
        body={
          <div className="flex flex-col gap-3">
            <p>{t('payment.reverse.body')}</p>
            <Input
              label={t('payment.reverse.reason')}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder={t('payment.reverse.reasonPlaceholder')}
            />
            {reverse.error ? (
              <p role="alert" className="rounded-input bg-debt-bg p-2 text-[13.5px] text-debt-fg">
                {errorMessage(reverse.error, t)}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={t('payment.reverse.confirm')}
        danger
        loading={reverse.isPending}
        onCancel={() => setReverseTarget(null)}
        onConfirm={async () => {
          if (!reverseTarget || reverseReason.trim() === '') return;
          try {
            await reverse.mutateAsync({ id: reverseTarget.id, reason: reverseReason.trim() });
            setReverseTarget(null);
          } catch {
            /* surfaced in dialog */
          }
        }}
      />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-3 text-center first:ps-0 last:pe-0">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
