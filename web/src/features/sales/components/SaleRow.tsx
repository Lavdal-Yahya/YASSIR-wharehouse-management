import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/Money';
import { StatusBadge } from '@/components/StatusBadge';
import type { Sale } from '../types';

// One sale as a row — used by:
//   * SalesListPage (this PR)
//   * SaleDetailPage's "related" section (rare)
//   * CustomerAccountPage (PR-2) — shows the customer's sales history
//
// Kept intentionally lean: reference + status + date + total. Callers
// wrap in whatever container fits (SectionCard, divide-y ul, etc).

type Tone = 'ok' | 'warn' | 'danger' | 'muted';

const paymentTone: Record<Sale['paymentStatus'], Tone> = {
  PAID: 'ok',
  PARTIALLY_PAID: 'warn',
  UNPAID: 'danger',
};

type Props = {
  sale: Sale;
  /** When true, cancelled sales get the muted badge instead of the payment-status one. */
  showCancelled?: boolean;
  /** Suppress the shop line — customer/sale detail pages already have the shop in the header. */
  hideShop?: boolean;
};

export function SaleRow({ sale, showCancelled = true, hideShop = false }: Props) {
  const { t } = useTranslation();
  const isCancelled = showCancelled && sale.status === 'CANCELLED';
  return (
    <Link
      to={`/sales/${sale.id}`}
      className="flex items-center gap-3 py-3 text-start hover:bg-tint/40"
    >
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">
            {sale.referenceNumber}
          </span>
          {isCancelled ? (
            <StatusBadge tone="muted">{t('sales.status.CANCELLED')}</StatusBadge>
          ) : (
            <StatusBadge tone={paymentTone[sale.paymentStatus]}>
              {t(`sales.payment.${sale.paymentStatus}`)}
            </StatusBadge>
          )}
        </div>
        <div className="text-[13px] text-muted">
          {new Date(sale.saleDate).toLocaleDateString()}
          {sale.customerName ? <> · {sale.customerName}</> : null}
          {!hideShop ? <> · {sale.shopName}</> : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Money value={sale.totalAmount} size="md" />
        {!isCancelled && sale.amountDue > 0 ? (
          <span className="text-[12px] font-medium text-debt-fg tabular-nums">
            {t('sales.row.due')} <Money value={sale.amountDue} size="sm" showCurrency={false} />
          </span>
        ) : null}
      </div>
    </Link>
  );
}
