import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { PlusIcon } from '@/components/icons';
import { errorMessage } from '@/shared/error-message';
import { Role } from '@/shared/enums';
import { useMe } from '@/features/auth/api';
import { useShopsList } from '@/features/shops/api';
import { Money } from '@/components/Money';
import { SaleRow } from '../components/SaleRow';
import { useSalesList } from '../api';
import type { PaymentStatus, SaleStatus } from '../types';

// Sales list — shop-scoped for SHOP employees (server forces it),
// OWNER can filter by shop / status / date range. Rows deep-link to
// the detail page via <SaleRow>.

const PAYMENT_STATUSES: PaymentStatus[] = ['PAID', 'PARTIALLY_PAID', 'UNPAID'];
const SALE_STATUSES: SaleStatus[] = ['ACTIVE', 'CANCELLED'];

const selectClass =
  'h-[50px] rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-[15px] text-ink focus:outline focus:outline-2 focus:outline-brand';

export default function SalesListPage() {
  const { t } = useTranslation();
  const me = useMe();
  const isShop = me.data?.user.role === Role.SHOP;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [shopId, setShopId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'' | PaymentStatus>('');
  const [status, setStatus] = useState<'' | SaleStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const shops = useShopsList({ page: 1, pageSize: 100 });
  const list = useSalesList({
    page,
    pageSize: 25,
    search: search || undefined,
    shopId: isShop ? undefined : shopId || undefined,
    paymentStatus: paymentStatus || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('sales.title')}
        subtitle={t('sales.subtitle')}
        actions={
          <Link to="/sell">
            <Button className="!h-11">
              <PlusIcon size={18} /> {t('sales.new')}
            </Button>
          </Link>
        }
      />

      <SectionCard>
        <div className="mb-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setPage(1);
                setSearch(v);
              }}
              placeholder={t('sales.searchPlaceholder')}
            />
          </div>
          {!isShop ? (
            <select
              value={shopId}
              onChange={(e) => {
                setPage(1);
                setShopId(e.target.value);
              }}
              className={selectClass}
              aria-label={t('sales.filter.shop')}
            >
              <option value="">{t('sales.filter.allShops')}</option>
              {shops.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={paymentStatus}
            onChange={(e) => {
              setPage(1);
              setPaymentStatus(e.target.value as '' | PaymentStatus);
            }}
            className={selectClass}
            aria-label={t('sales.filter.paymentStatus')}
          >
            <option value="">{t('sales.filter.allPaymentStatuses')}</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`sales.payment.${s}`)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as '' | SaleStatus);
            }}
            className={selectClass}
            aria-label={t('sales.filter.status')}
          >
            <option value="">{t('sales.filter.allStatuses')}</option>
            {SALE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`sales.status.${s}`)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            aria-label={t('sales.filter.from')}
            className={selectClass}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            aria-label={t('sales.filter.to')}
            className={selectClass}
          />
        </div>

        {list.data && list.data.total > 0 ? (
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
              <span className="font-semibold text-ink">
                {t('sales.summary.count', { count: list.data.total })}
              </span>
              <span className="text-muted">
                {t('sales.summary.units', { count: list.data.summary.totalUnits })}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                {t('sales.summary.totalAmount')}
              </span>
              <Money value={list.data.summary.totalAmount} size="md" />
              <div className="flex items-baseline gap-2 text-[11.5px] text-muted tabular-nums">
                <span className="text-collected">
                  {t('sales.summary.collected')}
                  {' '}
                  <Money value={list.data.summary.totalAmountPaid} size="sm" className="text-collected" />
                </span>
                <span>·</span>
                <span className="text-debt-fg">
                  {t('sales.summary.due')}
                  {' '}
                  <Money value={list.data.summary.totalAmountDue} size="sm" className="text-debt-fg" />
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {list.isLoading ? (
          <div className="flex items-center gap-2 text-[14px] text-muted">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="text-[14px] text-debt-fg">
            {errorMessage(list.error, t)}
          </p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="text-[14px] text-muted">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.data?.items.map((s) => (
              <li key={s.id}>
                <SaleRow sale={s} hideShop={isShop} />
              </li>
            ))}
          </ul>
        )}

        {list.data ? (
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        ) : null}
      </SectionCard>
    </div>
  );
}
