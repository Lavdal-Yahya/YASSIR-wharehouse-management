import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

// Integer-only stepper. Used everywhere a quantity is entered — order lines,
// receive amounts, corrections, opening stock. Blank string when value is
// null/undefined so the field can be truly empty.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number; // defaults to 0
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
        'w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-end text-sm tabular-nums text-slate-900 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 ' +
        className
      }
      {...rest}
    />
  );
});
