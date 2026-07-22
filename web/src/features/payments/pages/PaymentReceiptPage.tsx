import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useSettings } from '@/features/settings/api';
import { usePayment } from '../api';

// Payment receipt — same chrome-free treatment as SaleReceiptPage.
// Values come from debtBeforePayment / debtAfterPayment on the
// CustomerPayment row — these are snapshot fields (written at register
// time and never updated), so a reprint always shows the original state.

export default function PaymentReceiptPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const payment = usePayment(id);
  const settings = useSettings();

  const businessName = settings.data?.businessName?.trim() || t('app.name');
  const currency = settings.data?.currency || 'MRU';
  const footer = settings.data?.receiptFooter?.trim() || '';

  if (payment.isLoading || settings.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (payment.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p role="alert" className="text-[14px] text-red-600">
          {errorMessage(payment.error, t)}
        </p>
      </div>
    );
  }

  if (!payment.data) return null;
  const p = payment.data;

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Screen-only controls */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 print:hidden">
        <Link to={`/customers/${p.customerId}`}>
          <Button variant="secondary" size="sm">
            ← {t('payment.backToCustomer')}
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          {t('receipt.payment.print')}
        </Button>
      </div>

      {/* Receipt body */}
      <div className="mx-auto max-w-xs px-4 py-6 font-sans text-[13px] leading-snug text-black">
        {/* Business header */}
        <div className="mb-4 text-center">
          <div className="text-[17px] font-bold">{businessName}</div>
          <div className="text-[12px] text-gray-500">{p.shopName}</div>
        </div>

        <Divider />

        {/* Title */}
        <div className="mb-3 text-center text-[15px] font-bold">
          {t('receipt.payment.title')}
        </div>

        {/* Reference & date */}
        <Row label={t('receipt.payment.reference')} value={p.referenceNumber} />
        <Row
          label={t('receipt.payment.date')}
          value={new Date(p.paymentDate).toLocaleString()}
        />
        <Row label={t('receipt.payment.customer')} value={p.customerName} />

        <Divider />

        {/* Amount */}
        <Row
          label={t('receipt.payment.amount')}
          value={<Money value={p.amount} size="sm" currency={currency} />}
          bold
        />
        <Row
          label={t('receipt.payment.debtBefore')}
          value={<Money value={p.debtBeforePayment} size="sm" currency={currency} />}
        />
        <Row
          label={t('receipt.payment.debtAfter')}
          value={<Money value={p.debtAfterPayment} size="sm" currency={currency} />}
        />

        {/* Allocation breakdown */}
        {p.allocations.length > 0 ? (
          <>
            <Divider />
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              {t('receipt.payment.allocations')}
            </div>
            <ul>
              {p.allocations.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-0.5">
                  <span>{a.saleReference}</span>
                  <Money value={a.amountAllocated} size="sm" currency={currency} />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {footer ? (
          <>
            <Divider />
            <p className="text-center text-[12px] text-gray-500">{footer}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="my-3 border-dashed border-gray-300" />;
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-end tabular-nums">{value}</span>
    </div>
  );
}
