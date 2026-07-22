import type { ReactNode } from 'react';
import { Money } from '@/components/Money';

// Ledger stat card. One number, one label, optional hint. The design
// gives money figures three visual weights:
//
//   headline  — the today's-figures on the dashboard: 24-32px, uses
//               the <Money size="xl"> hierarchy, tone drives colour
//   default   — a stat tile: 18-24px
//
// Tone is data-driven, not decorative — 'positive' for money
// collected / sales value, 'debt' for outstanding / new debt,
// 'muted' for counts. Text label always carries the meaning.

type Tone = 'default' | 'positive' | 'debt' | 'muted';

const numberTone: Record<Tone, string> = {
  default: 'text-ink',
  positive: 'text-ink',
  debt: 'text-debt-fg',
  muted: 'text-ink',
};

const accent: Record<Tone, string> = {
  default: 'bg-line',
  positive: 'bg-collected',
  debt: 'bg-debt',
  muted: 'bg-line',
};

export function StatCard({
  label,
  value,
  hint,
  dominant = false,
  tone = 'default',
  money,
}: {
  label: ReactNode;
  /** Use `money` for currency values so the <Money> hierarchy applies; use `value` for counts / plain strings. */
  value?: ReactNode;
  money?: number | null | undefined;
  hint?: ReactNode;
  dominant?: boolean;
  tone?: Tone;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-4 text-start shadow-[0_1px_2px_rgba(24,25,40,0.04)]">
      <div
        className={`absolute inset-y-0 start-0 w-[3px] ${accent[tone]}`}
        aria-hidden
      />
      <div className="ps-2">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className={`mt-1.5 ${numberTone[tone]}`}>
          {money !== undefined ? (
            <Money value={money} size={dominant ? 'xl' : 'lg'} />
          ) : (
            <span
              className={
                'tabular-nums ' +
                (dominant
                  ? 'text-[28px] font-bold sm:text-[32px]'
                  : 'text-[20px] font-semibold sm:text-[24px]')
              }
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {value}
            </span>
          )}
        </div>
        {hint ? (
          <div className="mt-1 text-[12.5px] text-muted">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}
