import { useTranslation } from 'react-i18next';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { QuantityInput } from '@/components/QuantityInput';
import { MinusIcon, PlusIcon } from '@/components/icons';
import type { CartItem } from '../state';
import { totalAmount } from '../state';

// Cart panel — one row per line, inline price + qty editors, running
// total footer. On mobile a line stacks (name / qty+price / subtotal);
// on wider screens it lays out horizontally.

type Props = {
  items: CartItem[];
  onSetQty: (productId: string, quantity: number) => void;
  onSetPrice: (productId: string, unitPrice: number) => void;
  onRemove: (productId: string) => void;
};

export function CartPanel({ items, onSetQty, onSetPrice, onRemove }: Props) {
  const { t } = useTranslation();
  const total = totalAmount(items);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-soft bg-surface p-6 text-center text-[14px] text-muted">
        {t('sell.cart.empty')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface">
      <ul className="divide-y divide-line-soft">
        {items.map((it) => (
          <li key={it.productId} className="p-3 text-start">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-ink">
                {it.name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(it.productId)}
                aria-label={t('sell.cart.remove')}
                className="flex h-9 w-9 items-center justify-center rounded-input text-muted transition-colors hover:bg-neutral-bg hover:text-debt-fg"
              >
                <MinusIcon size={18} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
              <QtyStepper
                value={it.quantity}
                max={it.availableQty}
                onChange={(q) => onSetQty(it.productId, q)}
                labelIncrease={t('sell.cart.increaseQty')}
                labelDecrease={t('sell.cart.decreaseQty')}
              />
              <MoneyField
                value={it.unitPrice}
                onChange={(v) => onSetPrice(it.productId, v ?? 0)}
                ariaLabel={t('sell.cart.unitPrice', { product: it.name })}
              />
              <span className="hidden text-[13px] text-muted sm:inline">
                {t('sell.cart.available')}: <span className="tabular-nums">{it.availableQty}</span>
              </span>
              <div className="text-end">
                <Money value={it.quantity * it.unitPrice} size="md" />
              </div>
            </div>
            {it.quantity >= it.availableQty ? (
              <p className="mt-1 text-[12.5px] text-partial-fg">
                {t('sell.cart.maxReached', { max: it.availableQty })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-line p-3">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          {t('sell.cart.total')}
        </span>
        <Money value={total} size="xl" />
      </div>
    </div>
  );
}

function QtyStepper({
  value,
  max,
  onChange,
  labelIncrease,
  labelDecrease,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  labelIncrease: string;
  labelDecrease: string;
}) {
  return (
    <div className="inline-flex h-11 items-center rounded-input border-[1.5px] border-[#C8C9D4] overflow-hidden">
      <button
        type="button"
        onClick={() => value > 1 && onChange(value - 1)}
        aria-label={labelDecrease}
        disabled={value <= 1}
        className="flex h-full w-11 items-center justify-center text-brand transition-colors hover:bg-tint disabled:text-muted"
      >
        <MinusIcon size={18} />
      </button>
      <QuantityInput
        value={value}
        onChange={(n) => onChange(Math.max(1, n ?? 1))}
        min={1}
        max={max}
        className="!w-14 !h-full !border-0 !rounded-none focus:outline-none !text-center"
      />
      <button
        type="button"
        onClick={() => value < max && onChange(value + 1)}
        aria-label={labelIncrease}
        disabled={value >= max}
        className="flex h-full w-11 items-center justify-center text-brand transition-colors hover:bg-tint disabled:text-muted"
      >
        <PlusIcon size={18} />
      </button>
    </div>
  );
}
