import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/Button';
import { BalanceBar } from '@/components/BalanceBar';
import { Money } from '@/components/Money';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useSale } from '../api';

// Sale confirmation — its own screen, not a toast (design brief §38.5).
// Big success moment: what just happened, how much still owed, next
// steps. Print Receipt deep-links to the /sales/:id/receipt page.

export default function SaleConfirmationPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const sale = useSale(id);

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
  const paidInFull = s.amountDue === 0;

  return (
    <div>
      <PageHeader
        title={paidInFull ? t('sell.confirm.titlePaid') : t('sell.confirm.titlePartial')}
        subtitle={t('sell.confirm.subtitle', { ref: s.referenceNumber })}
      />

      {/* Result card — the design brief specifies this be reassuring
          and unmistakable. Big total, BalanceBar underneath so the
          collected/owed split is pre-attentive. */}
      <SectionCard elevated className="mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
            {t('sell.confirm.totalSold')}
          </span>
          <Money value={s.totalAmount} size="xl" />
        </div>
        <div className="mt-3">
          <BalanceBar
            collected={s.amountPaidAtSale}
            outstanding={s.amountDue}
            collectedLabel={t('sell.confirm.paidNow')}
            outstandingLabel={t('sell.confirm.owed')}
          />
        </div>
        {s.customerName ? (
          <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
            <span className="text-[13px] text-muted">
              {t('sell.confirm.customer')}
            </span>
            <Link
              to={`/customers`}
              className="text-[14px] font-semibold text-brand hover:underline"
            >
              {s.customerName}
              {s.customerPhone ? (
                <span className="ms-1 text-[13px] font-medium text-muted">
                  · {s.customerPhone}
                </span>
              ) : null}
            </Link>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('sell.confirm.itemsTitle')}>
        <ul className="divide-y divide-line-soft">
          {s.items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 py-3 text-start"
            >
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link to="/sell" replace>
          <Button className="!h-12">{t('sell.confirm.newSale')}</Button>
        </Link>
        <Link to={`/sales/${s.id}`}>
          <Button variant="secondary" className="!h-12">
            {t('sell.confirm.openDetail')}
          </Button>
        </Link>
        <Link to={`/sales/${s.id}/receipt`}>
          <Button variant="secondary" className="!h-12">
            {t('sell.confirm.printReceipt')}
          </Button>
        </Link>
        <div className="grow" />
        <StatusBadge
          tone={paidInFull ? 'ok' : s.paymentStatus === 'PARTIALLY_PAID' ? 'warn' : 'danger'}
        >
          {t(`sales.payment.${s.paymentStatus}`)}
        </StatusBadge>
      </div>
    </div>
  );
}
