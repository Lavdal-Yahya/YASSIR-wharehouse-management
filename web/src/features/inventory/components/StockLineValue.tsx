import { useTranslation } from 'react-i18next';
import { Money } from '@/components/Money';

// Per-row inventory-value chip on the stock lists (P4 UX iteration).
// Rendered next to the quantity so the reader can eyeball qty × cost
// without mental math. When the product has no purchaseCost we render a
// red "no cost" pill instead — the summary total also excludes it.

type Props = {
  quantity: number;
  purchaseCost: number | null;
};

export function StockLineValue({ quantity, purchaseCost }: Props) {
  const { t } = useTranslation();
  if (purchaseCost === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-debt-bg px-2 py-0.5 text-[11px] font-semibold text-debt-fg">
        {t('stock.summary.noCost')}
      </span>
    );
  }
  return (
    <div className="flex items-baseline gap-1 text-[11.5px] text-muted tabular-nums">
      <span className="uppercase tracking-wide">{t('stock.summary.lineValue')}</span>
      <Money value={quantity * purchaseCost} size="sm" />
    </div>
  );
}
