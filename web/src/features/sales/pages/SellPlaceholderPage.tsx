import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Money } from '@/components/Money';
import { SearchIcon } from '@/components/icons';
import { ConstructionOverlay } from '@/components/ConstructionOverlay';

// Placeholder for the /sell route — the SHOP FAB and the ShopStock
// "Sell" button both point here. The screen shows a mocked sale-flow
// layout (search + cart + payment step) behind the construction
// overlay so a user reaches something visibly-being-built rather than
// a 404 or an empty "coming soon" page.
//
// Replaces itself when Phase 6 PR-B ships the real sale flow.

export default function SellPlaceholderPage() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t('sell.mockTitle')} subtitle={t('sell.mockSubtitle')} />

      <ConstructionOverlay
        title={t('wip.saleFlow.title')}
        message={t('wip.saleFlow.message')}
      >
        {/* Mocked sale flow — read-only sketch. Numbers and product
            names are static placeholders. */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-4 py-3 text-muted">
            <SearchIcon size={20} />
            <span className="text-[15px]">
              {t('sell.mock.searchPlaceholder')}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-pill bg-brand px-4 py-2 text-[14px] font-semibold text-white">
              {t('sell.mock.categoryAll')}
            </span>
            <span className="rounded-pill border border-[#C8C9D4] bg-surface px-4 py-2 text-[14px] font-medium text-ink">
              {t('sell.mock.categoryPhones')}
            </span>
            <span className="rounded-pill border border-[#C8C9D4] bg-surface px-4 py-2 text-[14px] font-medium text-ink">
              {t('sell.mock.categoryAudio')}
            </span>
          </div>

          <SectionCard>
            <ul className="flex flex-col gap-3">
              {[
                { name: 'iPhone 13 · 128GB', qty: 1, price: 16500 },
                { name: 'AirPods Pro', qty: 1, price: 8200 },
              ].map((row) => (
                <li
                  key={row.name}
                  className="flex items-center gap-3 border-b border-line-soft pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint text-[10px] text-brand">
                    IMG
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-semibold text-ink">
                      {row.name}
                    </div>
                    <div className="text-[13px] text-muted tabular-nums">
                      {row.qty} × <Money value={row.price} size="sm" />
                    </div>
                  </div>
                  <Money value={row.qty * row.price} size="md" />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-[13.5px] font-semibold uppercase tracking-wide text-muted">
                {t('sell.mock.total')}
              </span>
              <Money value={24700} size="xl" />
            </div>
          </SectionCard>

          <SectionCard title={t('sell.mock.paymentStep')}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge tone="warn">{t('sell.mock.partialBadge')}</StatusBadge>
                <span className="text-[13.5px] text-muted">
                  {t('sell.mock.customerRequired')}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
                <span className="text-[14px] text-muted">
                  {t('sell.mock.paidNow')}
                </span>
                <Money value={15000} size="lg" className="text-collected-fg" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-muted">
                  {t('sell.mock.remaining')}
                </span>
                <Money value={9700} size="lg" className="text-debt-fg" />
              </div>
            </div>
          </SectionCard>
        </div>
      </ConstructionOverlay>
    </div>
  );
}
