import { formatMoney } from '@/shared/money';

// Money display — the design's typographic hierarchy for figures.
// The whole reason this is a component and not a call to formatMoney:
// consistent tabular numerals, consistent currency-suffix rendering,
// and one place to change every money site in the app.
//
// The design brief specifies four sizes (money-xl / lg / md / sm).
// Colour is inherited by default so a StatCard can wrap the amount
// in `text-collected` / `text-debt` without props on <Money>.

type Size = 'xl' | 'lg' | 'md' | 'sm';

const sizeClass: Record<Size, string> = {
  xl: 'text-[32px] font-bold leading-none',
  lg: 'text-[24px] font-bold leading-none',
  md: 'text-[18px] font-semibold',
  sm: 'text-[15px] font-semibold',
};

const suffixClass: Record<Size, string> = {
  xl: 'text-[13px]',
  lg: 'text-[12px]',
  md: 'text-[11px]',
  sm: 'text-[11px]',
};

export function Money({
  value,
  size = 'md',
  currency = 'MRU',
  className = '',
  showCurrency = true,
  signed = false,
}: {
  value: number | null | undefined;
  size?: Size;
  currency?: string;
  className?: string;
  showCurrency?: boolean;
  signed?: boolean; // renders a leading '+' for positive collected-side numbers
}) {
  if (value === null || value === undefined) {
    return (
      <span
        className={`inline-block tabular-nums text-muted ${sizeClass[size]} ${className}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        —
      </span>
    );
  }
  // Always render Western digits (Intl formatter without locale override)
  // per design brief §3.2 — money must be unambiguous in both scripts.
  const abs = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  const sign = value < 0 ? '−' : signed ? '+' : '';
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-sans tabular-nums ${sizeClass[size]} ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <span>
        {sign}
        {abs}
      </span>
      {showCurrency ? (
        <span
          className={`font-medium text-muted ${suffixClass[size]}`}
        >
          {currency}
        </span>
      ) : null}
    </span>
  );
}

// Convenience for plain-text sites (e-mails, alt text, print). Prefer
// <Money> in React trees; keep formatMoney for non-component consumers.
export { formatMoney };
