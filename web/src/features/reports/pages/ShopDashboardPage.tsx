import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { BalanceBar } from '@/components/BalanceBar';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { CardIcon, PackageIcon, UsersIcon } from '@/components/icons';
import { errorMessage } from '@/shared/error-message';
import { useShopReport } from '../api';

// Shop employee home — the design brief's item §4.2. The FAB in the
// bottom nav handles the "Sell" primary action; this screen provides
// today's numbers + the quiet quick actions for register-payment and
// add-expense. Everything at thumb reach.

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type QuickActionProps = {
  to: string;
  label: string;
  Icon: (p: { size?: number }) => ReactElement;
};

function QuickAction({ to, label, Icon }: QuickActionProps) {
  return (
    <Link
      to={to}
      className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-brand transition-colors hover:bg-tint"
    >
      <Icon size={22} />
      <span className="text-[13.5px] font-semibold text-ink">{label}</span>
    </Link>
  );
}

export default function ShopDashboardPage() {
  const { t } = useTranslation();
  const today = useMemo(() => todayIso(), []);
  const todayReport = useShopReport({ from: today, to: today });
  const allTime = useShopReport({});

  const loading = todayReport.isLoading || allTime.isLoading;
  const err = todayReport.error ?? allTime.error;

  return (
    <div>
      <PageHeader
        title={t('dashboard.shop.title')}
        subtitle={t('dashboard.shop.subtitle')}
      />

      {loading ? (
        <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
          <Spinner /> {t('loading')}
        </div>
      ) : err ? (
        <p
          role="alert"
          className="rounded-input bg-debt-bg px-3 py-2 text-[14px] font-medium text-debt-fg"
        >
          {errorMessage(err, t)}
        </p>
      ) : (
        <>
          {/* Headline card — today's sales value + BalanceBar. Same
              shape as the owner dashboard's headline, so the shop and
              owner views are visually consistent (they read the same
              numbers scoped differently on the server). */}
          <SectionCard elevated className="mb-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
                {t('dashboard.shop.todaySalesValue')}
              </span>
              <Money
                value={todayReport.data?.salesValue ?? 0}
                size="xl"
              />
            </div>
            <div className="mt-3">
              <BalanceBar
                collected={todayReport.data?.totalCollected ?? 0}
                outstanding={todayReport.data?.newDebt ?? 0}
                collectedLabel={t('dashboard.shop.todayCash')}
                outstandingLabel={t('dashboard.shop.todayDebt')}
              />
            </div>
          </SectionCard>

          {/* Outstanding is the single number the shop clerk needs at
              a glance ("how much do our customers owe us right now"). */}
          <SectionCard>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold text-muted">
                {t('dashboard.shop.myOutstanding')}
              </span>
              <Money
                value={allTime.data?.outstanding ?? 0}
                size="lg"
                className="text-debt-fg"
              />
            </div>
          </SectionCard>

          <section className="mt-8">
            <h2 className="mb-3 text-[15.5px] font-semibold text-ink text-start">
              {t('dashboard.shop.quickActions')}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <QuickAction
                to="/shop/stock"
                label={t('dashboard.shop.openStock')}
                Icon={PackageIcon}
              />
              <QuickAction
                to="/customers"
                label={t('dashboard.shop.openCustomers')}
                Icon={UsersIcon}
              />
              <QuickAction
                to="/expenses"
                label={t('dashboard.shop.openExpenses')}
                Icon={CardIcon}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
