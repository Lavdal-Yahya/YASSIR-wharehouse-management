import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { Button } from '@/components/Button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NavItem } from '@/components/NavItem';
import { useLogout, useMe } from '@/features/auth/api';
import { useSettings } from '@/features/settings/api';

type NavEntry = { to: string; labelKey: string; allowed: readonly Role[] };

const NAV: readonly NavEntry[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', allowed: [Role.OWNER] },
  { to: '/warehouse', labelKey: 'nav.warehouse', allowed: [Role.OWNER, Role.WAREHOUSE] },
  { to: '/orders', labelKey: 'nav.orders', allowed: [Role.OWNER, Role.WAREHOUSE] },
  { to: '/transfers', labelKey: 'nav.transfers', allowed: [Role.OWNER, Role.WAREHOUSE] },
  { to: '/products', labelKey: 'nav.products', allowed: [Role.OWNER, Role.WAREHOUSE] },
  { to: '/customers', labelKey: 'nav.customers', allowed: [Role.OWNER, Role.WAREHOUSE, Role.SHOP] },
  { to: '/shop/stock', labelKey: 'nav.shop', allowed: [Role.OWNER, Role.SHOP] },
  { to: '/expenses', labelKey: 'nav.expenses', allowed: [Role.OWNER, Role.SHOP] },
  { to: '/categories', labelKey: 'nav.categories', allowed: [Role.OWNER] },
  { to: '/shops', labelKey: 'nav.shops', allowed: [Role.OWNER] },
  { to: '/users', labelKey: 'nav.users', allowed: [Role.OWNER] },
  { to: '/settings', labelKey: 'nav.settings', allowed: [Role.OWNER] },
];

export function AuthedLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout();
  const settings = useSettings();
  const user = me.data?.user;
  const businessName = settings.data?.businessName?.trim() || t('app.name');
  if (!user) return null;

  const items = NAV.filter((n) => n.allowed.includes(user.role));

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col text-start">
            <span className="text-sm font-semibold text-slate-900">{businessName}</span>
            <span className="text-xs text-slate-500">
              {user.name} · {t(`role.${user.role}`)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              aria-label={t('nav.logout')}
            >
              {t('nav.logout')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 md:py-8">
        {/* Sidebar — visible on md+ */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="flex flex-col gap-1">
            {items.map((n) => (
              <NavItem key={n.to} to={n.to} label={t(n.labelKey)} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — visible on <md */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white px-2 py-2 md:hidden"
        aria-label={t('app.name')}
      >
        {items.map((n) => (
          <NavItem key={n.to} to={n.to} label={t(n.labelKey)} />
        ))}
      </nav>
    </div>
  );
}
