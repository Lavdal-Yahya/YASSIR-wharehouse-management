import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

// Ledger field — 50px min height, 1.5px border, always-visible label
// (design brief §5). Label placement is start-aligned via text-start
// so it flips correctly under html[dir="rtl"]. Errors sit immediately
// under the field, never as tooltips.

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode; // optional so a raw <input> can borrow the styling
  error?: string;
  hint?: ReactNode;
};

const inputClass =
  'w-full h-[50px] rounded-[8px] border-[1.5px] bg-surface px-[14px] text-[16px] text-ink ' +
  'placeholder:text-muted focus:outline focus:outline-2 focus:outline-offset-0';

const okBorder = 'border-[#C8C9D4] focus:outline-brand';
const badBorder = 'border-debt focus:outline-debt';

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, className = '', id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5 text-start">
      {label ? (
        <label htmlFor={inputId} className="text-[14px] font-semibold text-ink">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
        className={`${inputClass} ${error ? badBorder : okBorder} ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-[13.5px] leading-tight text-debt-fg">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13.5px] leading-tight text-muted">{hint}</p>
      ) : null}
    </div>
  );
});
