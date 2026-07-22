import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useSettings } from '@/features/settings/api';
import { useSale } from '../api';

// Sale receipt — minimal chrome (Print + Back only), white/black,
// 80mm-thermal-friendly width. Router places this outside AuthedLayout
// so the app sidebar and bottom nav don't appear on print.

export default function SaleReceiptPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const sale = useSale(id);
  const settings = useSettings();

  const businessName = settings.data?.businessName?.trim() || t('app.name');
  const currency = settings.data?.currency || 'MRU';
  const footer = settings.data?.receiptFooter?.trim() || '';

  if (sale.isLoading || settings.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (sale.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p role="alert" className="text-[14px] text-red-600">
          {errorMessage(sale.error, t)}
        </p>
      </div>
    );
  }

  if (!sale.data) return null;
  const s = sale.data;

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Screen-only controls */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 print:hidden">
        <Link to={`/sales/${s.id}`}>
          <Button variant="secondary" size="sm">
            ← {t('sales.detail.backToList')}
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          {t('receipt.sale.print')}
        </Button>
      </div>

      {/* Receipt body — centered, max 80mm (320px) for thermal printers */}
      <div className="mx-auto max-w-xs px-4 py-6 font-sans text-[13px] leading-snug text-black">
        {/* Business header */}
        <div className="mb-4 text-center">
          <div className="text-[17px] font-bold">{businessName}</div>
          <div className="text-[12px] text-gray-500">{s.shopName}</div>
        </div>

        <Divider />

        {/* Reference & date */}
        <Row label={t('receipt.sale.reference')} value={s.referenceNumber} />
        <Row
          label={t('receipt.sale.date')}
          value={new Date(s.saleDate).toLocaleString()}
        />
        {s.customerName ? (
          <Row label={t('receipt.sale.customer')} value={s.customerName} />
        ) : null}

        <Divider />

        {/* Items */}
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {t('receipt.sale.items')}
        </div>
        <ul className="mb-2">
          {s.items.map((it) => (
            <li key={it.id} className="mb-1">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{it.productName}</span>
                <Money value={it.lineTotal} size="sm" currency={currency} />
              </div>
              <div className="text-[12px] text-gray-500">
                {it.quantity} × <Money value={it.unitPrice} size="sm" currency={currency} showCurrency={false} />
              </div>
            </li>
          ))}
        </ul>

        <Divider />

        {/* Totals */}
        <Row
          label={t('receipt.sale.total')}
          value={<Money value={s.totalAmount} size="sm" currency={currency} />}
          bold
        />
        <Row
          label={t('receipt.sale.cashAtSale')}
          value={<Money value={s.amountPaidAtSale} size="sm" currency={currency} />}
        />
        {s.amountPaid - s.amountPaidAtSale > 0 ? (
          <Row
            label={t('sales.detail.laterPayments')}
            value={<Money value={s.amountPaid - s.amountPaidAtSale} size="sm" currency={currency} />}
          />
        ) : null}
        {s.amountDue > 0 && s.status !== 'CANCELLED' ? (
          <Row
            label={t('receipt.sale.totalDue')}
            value={<Money value={s.amountDue} size="sm" currency={currency} />}
            bold
          />
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
