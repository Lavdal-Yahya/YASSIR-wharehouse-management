import { forwardRef, useId } from 'react';
import type { ReactNode } from 'react';
import { normalizeDigits } from '@/shared/money';

// Integer MRU input. Accepts arabic-indic digits, strips spaces/commas as the
// user types, and only lets digits through. Emits an integer number (or null)
// via onChange — never a raw string.

type Props = {
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
  suffix?: string;
  placeholder?: string;
  min?: number;
};

export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { label, value, onChange, error, suffix = 'MRU', placeholder, min = 0 },
  ref,
) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  const display = value === null || value === undefined ? '' : String(value);

  return (
    <div className="flex flex-col gap-1 text-start">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = normalizeDigits(e.target.value).replace(/[\s,]/g, '');
            if (raw === '') return onChange(null);
            if (!/^\d+$/.test(raw)) return;
            const n = parseInt(raw, 10);
            if (min !== undefined && n < min) return;
            onChange(n);
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          className={
            'w-full rounded-md border bg-white px-3 py-2 pe-14 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-0 ' +
            (error ? 'border-red-400 focus:outline-red-400' : 'border-slate-300 focus:outline-slate-400')
          }
        />
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-slate-500">
          {suffix}
        </span>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
