import { useTranslation } from 'react-i18next';
import { Money } from '@/components/Money';
import type { StockSummary } from '../types';

// Displayed above a stock list so the user can read the total picture
// (products, units, purchase-cost value) at a glance. Reflects the
// current filters — the numbers move as the user narrows the list.

type Props = {
  productCount: number;
  summary: StockSummary;
};

export function StockSummaryHeader({ productCount, summary }: Props) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
        <span className="font-semibold text-ink">
          {t('stock.summary.products', { count: productCount })}
        </span>
        <span className="text-muted">
          {t('stock.summary.units', { count: summary.totalUnits })}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {t('stock.summary.totalValue')}
        </span>
        <Money value={summary.totalValue} size="md" />
        {summary.productsMissingCost > 0 ? (
          <span className="mt-0.5 text-[11.5px] text-muted">
            {t('stock.summary.missingCost', { count: summary.productsMissingCost })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
