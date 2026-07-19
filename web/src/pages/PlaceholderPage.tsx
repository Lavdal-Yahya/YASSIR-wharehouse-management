import type { ReactNode } from 'react';

// Empty-shell page used by Phase 1 while the real screens come in later phases.
// Keeps every route mounted and translatable so navigation + i18n can be verified.
export function PlaceholderPage({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </section>
  );
}
