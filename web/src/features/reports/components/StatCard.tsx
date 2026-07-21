import type { ReactNode } from 'react';

// Numbers-first stat card (spec §9 / design brief §4.3 — no
// decorative charts on dashboards / reports). One number, one label,
// one optional hint. `dominant` bumps the number size and font
// weight — used for the three headline figures per phase-7 §7 item 1
// (sales value / cash / outstanding must be visibly distinct).
//
// Tone drives an accent bar on the start-side of the card so users
// can visually group related figures without color-only encoding
// (accessibility — text label is still authoritative).

type Tone = 'default' | 'positive' | 'debt' | 'muted';

const toneBar: Record<Tone, string> = {
  default: 'bg-slate-300',
  positive: 'bg-emerald-400',
  debt: 'bg-amber-400',
  muted: 'bg-slate-200',
};

export function StatCard({
  label,
  value,
  hint,
  dominant = false,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  dominant?: boolean;
  tone?: Tone;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-start">
      <div className={`absolute inset-y-0 start-0 w-1 ${toneBar[tone]}`} aria-hidden />
      <div className="ps-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div
          className={
            'mt-1 tabular-nums text-slate-900 ' +
            (dominant
              ? 'text-2xl font-semibold sm:text-3xl'
              : 'text-lg font-medium sm:text-xl')
          }
        >
          {value}
        </div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </div>
    </div>
  );
}
