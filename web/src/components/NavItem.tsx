import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

type Props = {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
};

// Renders identically in sidebar and bottom-nav; the layout wraps it.
export function NavItem({ to, label, icon }: Props) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
        (isActive
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
