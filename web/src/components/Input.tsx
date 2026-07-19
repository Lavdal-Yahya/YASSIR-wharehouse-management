import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className = '', id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1 text-start">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
        className={
          'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 ' +
          'placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-0 ' +
          (error
            ? 'border-red-400 focus:outline-red-400 '
            : 'border-slate-300 focus:outline-slate-400 ') +
          className
        }
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
