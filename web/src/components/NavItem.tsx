import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

type Props = {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Bottom-nav variant: icon stacks above label, no background pill. */
  bottom?: boolean;
};

// Same source, two chromes: sidebar (rows) and mobile bottom-nav (stacked).
// Active state uses the brand tint for the sidebar and brand ink for the
// bottom nav (per the design comps).
export function NavItem({ to, label, icon, bottom = false }: Props) {
  if (bottom) {
    return (
      <NavLink
        to={to}
        end
        className={({ isActive }) =>
          'flex flex-1 flex-col items-center gap-1 py-1 text-[11.5px] font-semibold transition-colors ' +
          (isActive ? 'text-brand' : 'text-muted')
        }
      >
        {icon}
        <span className="whitespace-nowrap">{label}</span>
      </NavLink>
    );
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        'flex items-center gap-2 rounded-input px-3 py-2 text-[14px] font-semibold transition-colors ' +
        (isActive
          ? 'bg-tint text-brand'
          : 'text-ink/80 hover:bg-tint hover:text-brand')
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
