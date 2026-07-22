import type { ReactNode } from 'react';

// Status pill — text + color + a small dot, never color alone
// (spec §38.4, design brief §3.4). Tones map to the money-status
// palette from the design tokens.

type Tone = 'ok' | 'warn' | 'danger' | 'muted';

const bg: Record<Tone, string> = {
  ok: 'bg-collected-bg text-collected-fg',
  warn: 'bg-partial-bg text-partial-fg',
  danger: 'bg-debt-bg text-debt-fg',
  muted: 'bg-neutral-bg text-neutral-fg',
};

const dot: Record<Tone, string> = {
  ok: 'bg-collected',
  warn: 'bg-partial',
  danger: 'bg-debt',
  muted: 'bg-neutral-dot',
};

export function StatusBadge({
  tone = 'muted',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-semibold ${bg[tone]}`}
    >
      <span className={`h-[7px] w-[7px] rounded-full ${dot[tone]}`} aria-hidden />
      {children}
    </span>
  );
}
