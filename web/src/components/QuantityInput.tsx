import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

// Integer stepper input — quantities everywhere (order lines, receive
// amounts, corrections, opening stock). Kept as a raw number input so
// mobile keyboards surface the numeric pad; a true +/- stepper widget
// lives inside the sale flow when that ships.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
};

export const QuantityInput = forwardRef<HTMLInputElement, Props>(function QuantityInput(
  { value, onChange, min = 0, max, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      step={1}
      min={min}
      max={max}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(null);
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) return onChange(null);
        onChange(n);
      }}
      className={
        'w-24 h-[46px] rounded-[8px] border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-end text-[15px] font-semibold tabular-nums text-ink ' +
        'focus:outline focus:outline-2 focus:outline-brand ' +
        className
      }
      style={{ fontVariantNumeric: 'tabular-nums' }}
      {...rest}
    />
  );
});
