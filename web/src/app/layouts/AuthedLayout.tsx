import { Link, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { Button } from '@/components/Button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NavItem } from '@/components/NavItem';
import {
  CardIcon,
  CashIcon,
  ChartIcon,
  HomeIcon,
  LogoutIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
} from '@/components/icons';
import { useLogout, useMe } from '@/features/auth/api';
import { useSettings } from '@/features/settings/api';

type NavEntry = {
  to: string;
  labelKey: string;
  allowed: readonly Role[];
  icon?: (props: { size?: number }) => ReactNode;
  /** Show in the desktop sidebar (defaults true). Everything shows in sidebar; bottom nav is a curated subset. */
  sidebar?: boolean;
};

// Full nav — the desktop sidebar shows everything a role can reach.
// Order matches the design brief's mental model: home, money screens
// first, stock in the middle, admin at the bottom.
const NAV: readonly NavEntry[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', allowed: [Role.OWNER], icon: HomeIcon },
  { to: '/shop', labelKey: 'nav.shop', allowed: [Role.OWNER, Role.SHOP], icon: HomeIcon },
  { to: '/customers', labelKey: 'nav.customers', allowed: [Role.OWNER, Role.WAREHOUSE, Role.SHOP], icon: UsersIcon },
  { to: '/expenses', labelKey: 'nav.expenses', allowed: [Role.OWNER, Role.SHOP], icon: CardIcon },
  { to: '/reports/shop', labelKey: 'nav.reports', allowed: [Role.OWNER, Role.SHOP], icon: ChartIcon },
  { to: '/shop/stock', labelKey: 'nav.shopStock', allowed: [Role.OWNER, Role.SHOP], icon: PackageIcon },
  { to: '/warehouse', labelKey: 'nav.warehouse', allowed: [Role.OWNER, Role.WAREHOUSE], icon: PackageIcon },
  { to: '/orders', labelKey: 'nav.orders', allowed: [Role.OWNER, Role.WAREHOUSE], icon: ReceiptIcon },
  { to: '/transfers', labelKey: 'nav.transfers', allowed: [Role.OWNER, Role.WAREHOUSE], icon: TruckIcon },
  { to: '/products', labelKey: 'nav.products', allowed: [Role.OWNER, Role.WAREHOUSE], icon: CashIcon },
  { to: '/categories', labelKey: 'nav.categories', allowed: [Role.OWNER], icon: PackageIcon },
  { to: '/shops', labelKey: 'nav.shops', allowed: [Role.OWNER], icon: PackageIcon },
  { to: '/users', labelKey: 'nav.users', allowed: [Role.OWNER], icon: UsersIcon },
  { to: '/settings', labelKey: 'nav.settings', allowed: [Role.OWNER], icon: SettingsIcon },
];

// Mobile bottom-nav — max 5 items per role (design brief §3.6).
// Kept as a per-role list so a WAREHOUSE user never sees SHOP screens
// and vice versa. Empty items get filled with placeholders around the
// SHOP FAB so the 5-column layout stays visually balanced.
const BOTTOM_NAV: Record<Role, readonly NavEntry[]> = {
  OWNER: [
    { to: '/dashboard', labelKey: 'nav.dashboard', allowed: [Role.OWNER], icon: HomeIcon },
    { to: '/customers', labelKey: 'nav.customers', allowed: [Role.OWNER], icon: UsersIcon },
    { to: '/reports/shop', labelKey: 'nav.reports', allowed: [Role.OWNER], icon: ChartIcon },
    { to: '/warehouse', labelKey: 'nav.warehouse', allowed: [Role.OWNER], icon: PackageIcon },
    { to: '/settings', labelKey: 'nav.settings', allowed: [Role.OWNER], icon: SettingsIcon },
  ],
  WAREHOUSE: [
    { to: '/warehouse', labelKey: 'nav.warehouse', allowed: [Role.WAREHOUSE], icon: PackageIcon },
    { to: '/orders', labelKey: 'nav.orders', allowed: [Role.WAREHOUSE], icon: ReceiptIcon },
    { to: '/transfers', labelKey: 'nav.transfers', allowed: [Role.WAREHOUSE], icon: TruckIcon },
    { to: '/products', labelKey: 'nav.products', allowed: [Role.WAREHOUSE], icon: CashIcon },
    { to: '/customers', labelKey: 'nav.customers', allowed: [Role.WAREHOUSE], icon: UsersIcon },
  ],
  SHOP: [
    { to: '/shop', labelKey: 'nav.shop', allowed: [Role.SHOP], icon: HomeIcon },
    { to: '/customers', labelKey: 'nav.customers', allowed: [Role.SHOP], icon: UsersIcon },
    // Slot 3 is the elevated Sell FAB — inserted at render time.
    { to: '/shop/stock', labelKey: 'nav.shopStock', allowed: [Role.SHOP], icon: PackageIcon },
    { to: '/expenses', labelKey: 'nav.expenses', allowed: [Role.SHOP], icon: CardIcon },
  ],
};

export function AuthedLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout();
  const settings = useSettings();
  const user = me.data?.user;
  const businessName = settings.data?.businessName?.trim() || t('app.name');
  if (!user) return null;

  const sidebarItems = NAV.filter((n) => n.allowed.includes(user.role));
  const bottomItems = BOTTOM_NAV[user.role];

  return (
    <div className="min-h-dvh bg-app text-ink">
      {/* Indigo brand header — melhfa colour carries the chrome. */}
      <header className="sticky top-0 z-20 bg-brand text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col text-start">
            <span className="text-[15px] font-semibold leading-tight">
              {businessName}
            </span>
            <span className="text-[12.5px] text-white/70">
              {user.name} · {t(`role.${user.role}`)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="onBrand" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => logout.mutate()}
              loading={logout.isPending}
              aria-label={t('nav.logout')}
              className="!text-white hover:!bg-white/10"
            >
              <LogoutIcon size={18} />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-3 py-4 sm:px-4 md:py-6">
        {/* Sidebar — md+ */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-[80px] flex flex-col gap-0.5">
            {sidebarItems.map((n) => (
              <NavItem
                key={n.to}
                to={n.to}
                label={t(n.labelKey)}
                icon={n.icon ? <n.icon size={18} /> : null}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-28 md:pb-4">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav — role-shaped. SHOP gets the elevated Sell FAB;
          OWNER and WAREHOUSE get the flat 5-item bar (advisor note). */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),0px)] md:hidden"
        aria-label={t('app.name')}
      >
        <div className="mx-auto flex max-w-md items-stretch px-1 pt-2">
          {user.role === Role.SHOP ? (
            <>
              {bottomItems.slice(0, 2).map((n) => (
                <NavItem
                  key={n.to}
                  to={n.to}
                  label={t(n.labelKey)}
                  bottom
                  icon={n.icon ? <n.icon size={22} /> : null}
                />
              ))}
              <div className="flex flex-1 flex-col items-center gap-1 -mt-6">
                <Link
                  to="/sell"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_4px_14px_rgba(47,50,114,0.4)] transition-colors hover:bg-brand-pressed"
                  aria-label={t('nav.sell')}
                >
                  <PlusIcon size={26} />
                </Link>
                <span className="text-[11.5px] font-semibold text-brand">
                  {t('nav.sell')}
                </span>
              </div>
              {bottomItems.slice(2, 4).map((n) => (
                <NavItem
                  key={n.to}
                  to={n.to}
                  label={t(n.labelKey)}
                  bottom
                  icon={n.icon ? <n.icon size={22} /> : null}
                />
              ))}
            </>
          ) : (
            bottomItems.map((n) => (
              <NavItem
                key={n.to}
                to={n.to}
                label={t(n.labelKey)}
                bottom
                icon={n.icon ? <n.icon size={22} /> : null}
              />
            ))
          )}
        </div>
      </nav>
    </div>
  );
}
