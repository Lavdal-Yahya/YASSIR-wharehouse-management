import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useSettings } from '@/features/settings/api';
import { useShop } from '@/features/shops/api';
import { useSale } from '../api';

// Print-optimized receipt (P6-B). Two paper sizes — 80mm thermal roll
// (default) and A4 — switchable via a toggle. Layout chrome hides via
// the `.print-hide` class on the AuthedLayout header/aside/mobile nav
// and on the on-page action bar, so the browser's Print dialog gets
// just the receipt. Uses black-on-white regardless of app theme to
// keep the ink footprint predictable across printers.

type Format = 'thermal' | 'a4';

export default function SaleReceiptPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const sale = useSale(id);
  const settings = useSettings();
  const shop = useShop(sale.data?.shopId);
  const [format, setFormat] = useState<Format>('thermal');

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  );

  if (sale.isLoading || settings.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (sale.error) {
    return (
      <p role="alert" className="p-3 text-[14px] text-debt-fg">
        {errorMessage(sale.error, t)}
      </p>
    );
  }
  if (!sale.data || !settings.data) return null;
  const s = sale.data;
  const shopData = shop.data;
  const isCancelled = s.status === 'CANCELLED';

  return (
    <div>
      {/* On-screen action bar. Hidden at print time so only the paper
          block goes to the printer. */}
      <div className="print-hide mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to={`/sales/${s.id}`}>
            <Button variant="ghost" size="sm">
              {t('sales.receipt.back')}
            </Button>
          </Link>
          <div className="inline-flex rounded-md border border-line-soft bg-app p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1 text-[13px] font-semibold ${
                format === 'thermal' ? 'bg-surface text-ink shadow-sm' : 'text-muted'
              }`}
              onClick={() => setFormat('thermal')}
            >
              {t('sales.receipt.formatThermal')}
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-[13px] font-semibold ${
                format === 'a4' ? 'bg-surface text-ink shadow-sm' : 'text-muted'
              }`}
              onClick={() => setFormat('a4')}
            >
              {t('sales.receipt.formatA4')}
            </button>
          </div>
        </div>
        <Button size="sm" onClick={() => window.print()}>
          {t('sales.receipt.printNow')}
        </Button>
      </div>

      <div
        className="print-receipt mx-auto my-4 rounded border border-line-soft bg-surface p-4 shadow-sm"
        data-format={format}
      >
        <header className="text-center">
          <h1 className="text-[16px] font-bold uppercase tracking-wide">
            {settings.data.businessName}
          </h1>
          {shopData ? (
            <div className="mt-1 text-[12px] leading-tight">
              <div>{shopData.name}</div>
              {shopData.address ? <div>{shopData.address}</div> : null}
              {shopData.phone ? <div>{shopData.phone}</div> : null}
            </div>
          ) : null}
        </header>

        <div className="my-3 border-t border-dashed border-black/30" />

        <div className="grid grid-cols-2 gap-1 text-[12px]">
          <span className="font-semibold">{t('sales.receipt.reference')}</span>
          <span className="text-end">{s.referenceNumber}</span>
          <span className="font-semibold">{t('sales.receipt.date')}</span>
          <span className="text-end">{dateFmt.format(new Date(s.saleDate))}</span>
          {s.customerName ? (
            <>
              <span className="font-semibold">{t('sales.receipt.customer')}</span>
              <span className="text-end">
                {s.customerName}
                {s.customerPhone ? ` — ${s.customerPhone}` : ''}
              </span>
            </>
          ) : null}
        </div>

        <div className="my-3 border-t border-dashed border-black/30" />

        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-black/30 text-start">
              <th className="py-1 text-start font-semibold">{t('sales.receipt.item')}</th>
              <th className="py-1 text-end font-semibold">{t('sales.receipt.qty')}</th>
              <th className="py-1 text-end font-semibold">{t('sales.receipt.unit')}</th>
              <th className="py-1 text-end font-semibold">{t('sales.receipt.line')}</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-1 pe-1 text-start">{it.productName}</td>
                <td className="py-1 text-end tabular-nums">{it.quantity}</td>
                <td className="py-1 text-end tabular-nums">{it.unitPrice}</td>
                <td className="py-1 text-end tabular-nums">{it.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-3 border-t border-dashed border-black/30" />

        <div className="space-y-1 text-[13px]">
          <TotalLine
            label={t('sales.receipt.total')}
            value={s.totalAmount}
            currency={settings.data.currency}
            bold
          />
          <TotalLine
            label={t('sales.receipt.paid')}
            value={s.amountPaid}
            currency={settings.data.currency}
          />
          {s.amountDue > 0 && !isCancelled ? (
            <TotalLine
              label={t('sales.receipt.due')}
              value={s.amountDue}
              currency={settings.data.currency}
              bold
            />
          ) : null}
        </div>

        {settings.data.receiptFooter ? (
          <>
            <div className="my-3 border-t border-dashed border-black/30" />
            <p className="whitespace-pre-line text-center text-[11.5px]">
              {settings.data.receiptFooter}
            </p>
          </>
        ) : null}

        {isCancelled ? (
          <div className="mt-3 rounded border-2 border-black py-1 text-center text-[13px] font-bold uppercase tracking-widest">
            {t('sales.receipt.cancelledStamp')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TotalLine({
  label,
  value,
  currency,
  bold = false,
}: {
  label: string;
  value: number;
  currency: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value} {currency}</span>
    </div>
  );
}
