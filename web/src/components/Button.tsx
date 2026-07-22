import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

// Ledger buttons — 48-52px min height for one-handed thumb targets at a
// crowded counter (design brief §5). Four variants:
//   primary   — indigo brand, the affirmative action on every screen
//   secondary — indigo tint, quiet twin used in receipt / print rows
//   ghost     — no background, only used inside menus / sub-actions
//   danger    — outlined red for destructive confirmations
//
// Loading state swaps a spinner in but keeps the label to preserve
// button width — nothing worse than a Confirm button that reflows to
// a hand-typing user under time pressure.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 font-semibold ' +
  'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const sizes: Record<Size, string> = {
  md: 'h-12 rounded-[10px] px-5 text-[15px]',
  sm: 'h-9 rounded-lg px-3 text-sm',
};

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-pressed focus-visible:outline-brand',
  secondary:
    'bg-tint text-brand hover:bg-[color-mix(in_srgb,var(--color-tint)_88%,var(--color-brand))] focus-visible:outline-brand',
  ghost:
    'bg-transparent text-ink hover:bg-tint focus-visible:outline-brand',
  danger:
    'bg-surface text-debt-fg border-[1.5px] border-debt hover:bg-debt-bg focus-visible:outline-debt',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});
