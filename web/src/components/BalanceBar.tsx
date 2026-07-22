import type { ReactNode } from 'react';
import { Money } from './Money';

// The signature element of the Ledger design (design brief §6).
//
// Every monetary event — a sale, a payment, a customer account, a
// day's total — renders the same two-tone bar: green for money
// collected, red for money outstanding. Widths are exactly
// proportional to the two amounts so a debt sale can NEVER be
// mistaken for cash in the drawer.
//
// The type signature is strict on purpose (advisor rule #3):
// `collected` and `outstanding` are the only inputs — there is no
// generic left/right prop, so a screen can't accidentally pass
// sales-value where collected belongs. If outstanding is zero,
// render green-only, no red hairline.

type Props = {
  collected: number;
  outstanding: number;
  collectedLabel?: ReactNode;
  outstandingLabel?: ReactNode;
  currency?: string;
  /** Larger track for card headlines. */
  size?: 'sm' | 'md';
};

export function BalanceBar({
  collected,
  outstanding,
  collectedLabel,
  outstandingLabel,
  currency = 'MRU',
  size = 'md',
}: Props) {
  const total = Math.max(0, collected) + Math.max(0, outstanding);
  const height = size === 'md' ? 'h-2' : 'h-1.5';

  // Both zero — muted empty track. Green-only when no debt.
  const showRed = outstanding > 0;
  const showGreen = collected > 0;

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="balance">
      <div className="flex items-baseline justify-between gap-3 text-[13.5px] font-semibold tabular-nums">
        <span className="text-collected-fg inline-flex items-baseline gap-1.5">
          {collectedLabel ? (
            <span className="font-medium text-collected-fg/90">
              {collectedLabel}
            </span>
          ) : null}
          <Money
            value={collected}
            size="sm"
            currency={currency}
            showCurrency={false}
            className="text-collected-fg"
          />
        </span>
        <span className="text-debt-fg inline-flex items-baseline gap-1.5">
          {outstandingLabel ? (
            <span className="font-medium text-debt-fg/90">
              {outstandingLabel}
            </span>
          ) : null}
          <Money
            value={outstanding}
            size="sm"
            currency={currency}
            showCurrency={false}
            className="text-debt-fg"
          />
        </span>
      </div>
      <div
        className={`flex gap-[2px] ${height} overflow-hidden rounded-[4px] bg-line-soft`}
        aria-hidden
      >
        {total === 0 ? null : (
          <>
            {showGreen ? (
              <div
                className="bg-collected"
                style={{ flex: `${Math.max(1, collected)} 1 0` }}
              />
            ) : null}
            {showRed ? (
              <div
                className="bg-debt"
                style={{ flex: `${Math.max(1, outstanding)} 1 0` }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
