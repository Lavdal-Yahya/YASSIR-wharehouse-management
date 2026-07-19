import type { ReactNode } from 'react';

type Tone = 'ok' | 'muted' | 'warn' | 'danger';

const styles: Record<Tone, string> = {
  // Text + color, never color alone (accessibility).
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  muted: 'bg-slate-100 text-slate-700 border-slate-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
};

export function StatusBadge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
