import { forwardRef, useId } from 'react';
import type { ReactNode } from 'react';
import { normalizeDigits } from '@/shared/money';

// MoneyInput — the number is the interface (design brief §3.3).
// Tall (64px), heavy typography, brand-outline focus. Currency suffix
// is muted grey pinned to the end (RTL-safe via `end`).
// Accepts Arabic-Indic digits, strips spaces/commas, emits an integer.

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
    <div className="flex flex-col gap-1.5 text-start">
      <label htmlFor={id} className="text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div
        className={
          'relative flex items-center h-16 rounded-[10px] border-[2px] bg-surface pe-16 ps-4 ' +
          (error ? 'border-debt' : 'border-brand')
        }
      >
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
          className="w-full bg-transparent text-[28px] font-bold tabular-nums text-ink outline-none font-sans placeholder:text-muted placeholder:font-medium"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-[15px] font-semibold text-muted font-sans">
          {suffix}
        </span>
      </div>
      {error ? (
        <p id={errorId} className="text-[13.5px] leading-tight text-debt-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
});
