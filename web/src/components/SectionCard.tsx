import type { ReactNode } from 'react';

// A white surface with the ledger's card treatment — border + radius 14
// + subtle shadow. Everything in the design that groups related
// content sits inside one of these; there are no bare white blocks.

type Props = {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Larger padding for hero cards (dashboard headline). Default is comfortable list padding. */
  padded?: boolean;
  /** Elevated visual weight for the dashboard's headline block. */
  elevated?: boolean;
};

export function SectionCard({
  children,
  title,
  action,
  className = '',
  padded = true,
  elevated = false,
}: Props) {
  const pad = padded ? 'p-4 sm:p-5' : '';
  const shadow = elevated
    ? 'shadow-[0_6px_20px_rgba(24,25,40,0.08)]'
    : 'shadow-[0_1px_2px_rgba(24,25,40,0.04)]';
  return (
    <section
      className={`rounded-lg border border-line bg-surface ${shadow} ${pad} ${className}`}
    >
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-[15.5px] font-semibold text-ink text-start">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
