import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { errorMessage } from '@/shared/error-message';
import { normalizeDigits } from '@/shared/money';
import { useDeleteShopPrice, useUpsertShopPrice } from '../api';

// Inline sale-price editor. Renders as a popover next to the product
// row on the shop stock page. Blank → DELETE (clear override). Number
// → PUT (upsert). Closes on Enter or outside click.

type Props = {
  shopId: string;
  productId: string;
  productName: string;
  currentPrice: number | null;
  onClose: () => void;
};

export function ShopPriceEditor({
  shopId,
  productId,
  productName,
  currentPrice,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState<number | null>(currentPrice);
  const rootRef = useRef<HTMLDivElement>(null);
  const upsert = useUpsertShopPrice(shopId);
  const remove = useDeleteShopPrice(shopId);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const busy = upsert.isPending || remove.isPending;
  const err = upsert.error ?? remove.error;

  const save = async () => {
    try {
      if (value === null) await remove.mutateAsync(productId);
      else await upsert.mutateAsync({ productId, salePrice: value });
      onClose();
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div
      ref={rootRef}
      className="z-20 flex w-72 flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-lg"
      role="dialog"
      aria-label={t('shopStock.editPriceTitle', { product: productName })}
    >
      <div className="text-[13px] font-semibold text-ink">
        {t('shopStock.editPriceTitle', { product: productName })}
      </div>
      <p className="text-[12px] text-muted">{t('shopStock.editPriceHint')}</p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          inputMode="numeric"
          value={value === null ? '' : String(value)}
          onChange={(e) => {
            const raw = normalizeDigits(e.target.value).replace(/[\s,]/g, '');
            if (raw === '') return setValue(null);
            if (!/^\d+$/.test(raw)) return;
            setValue(parseInt(raw, 10));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          className="flex-1 rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-[15px] font-semibold tabular-nums text-ink"
          aria-label={t('shopStock.editPriceTitle', { product: productName })}
        />
        <span className="text-[12px] font-semibold text-muted">MRU</span>
      </div>
      {err ? (
        <p role="alert" className="text-[12.5px] text-debt-fg">
          {errorMessage(err, t)}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={save} loading={busy}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
