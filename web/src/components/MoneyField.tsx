import { forwardRef, useId } from 'react';
import { normalizeDigits } from '@/shared/money';

// Compact integer-money input for dense contexts — cart-row unit prices,
// stepper-adjacent price edits. Where <MoneyInput> is the 64px headline
// treatment for payment steps, this is 44-46px inline treatment for
// list rows. Same digit-normalisation contract; no label (the field
// sits next to a product name that already labels it).

type Props = {
  value: number | null;
  onChange: (v: number | null) => void;
  ariaLabel: string; // required — no visible label so a11y needs one
  suffix?: string;
  placeholder?: string;
  min?: number;
  className?: string;
};

export const MoneyField = forwardRef<HTMLInputElement, Props>(function MoneyField(
  { value, onChange, ariaLabel, suffix = 'MRU', placeholder, min = 0, className = '' },
  ref,
) {
  const id = useId();
  const display = value === null || value === undefined ? '' : String(value);
  return (
    <div
      className={
        'relative flex h-11 items-center rounded-input border-[1.5px] border-[#C8C9D4] bg-surface pe-14 ps-3 focus-within:border-brand focus-within:outline focus-within:outline-2 focus-within:outline-brand ' +
        className
      }
    >
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = normalizeDigits(e.target.value).replace(/[\s,]/g, '');
          if (raw === '') return onChange(null);
          if (!/^\d+$/.test(raw)) return;
          const n = parseInt(raw, 10);
          if (min !== undefined && n < min) return;
          onChange(n);
        }}
        className="w-full bg-transparent text-[15px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted font-sans"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold text-muted">
        {suffix}
      </span>
    </div>
  );
});
