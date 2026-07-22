import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="text-start">
        <h1 className="text-[22px] font-bold leading-tight text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
