import { useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/Button';
import { MoneyInput } from '@/components/MoneyInput';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { Role } from '@/shared/enums';
import { useMe } from '@/features/auth/api';
import { useShopsList } from '@/features/shops/api';
import { useCustomer, useCustomerSummary } from '../api';
import { useSalesList } from '@/features/sales/api';
import { useRegisterPayment } from '@/features/payments/api';
import type { Sale } from '@/features/sales/types';

// Oldest-first allocation preview — mirrors the server algorithm exactly.
type PlanLine = {
  saleId: string;
  saleReference: string;
  saleDate: string;
  amountDue: number;
  allocated: number;
  settles: boolean;
};

function buildPlan(sales: Sale[], amount: number): PlanLine[] {
  // Sort oldest first (matches server's FOR UPDATE order).
  const sorted = [...sales].sort((a, b) => {
    const d = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime();
    return d !== 0 ? d : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const plan: PlanLine[] = [];
  let remaining = amount;
  for (const s of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, s.amountDue);
    plan.push({
      saleId: s.id,
      saleReference: s.referenceNumber,
      saleDate: s.saleDate,
      amountDue: s.amountDue,
      allocated: take,
      settles: take === s.amountDue,
    });
    remaining -= take;
  }
  return plan;
}

export default function RegisterPaymentPage() {
  const { t } = useTranslation();
  const { id: customerId } = useParams<{ id: string }>();
  const nav = useNavigate();
  const me = useMe();
  const isOwner = me.data?.user.role === Role.OWNER;
  const assignedShopId = me.data?.user.assignedShopId ?? '';

  const customer = useCustomer(customerId);
  const summary = useCustomerSummary(customerId);
  const unpaidSales = useSalesList({
    customerId,
    paymentStatus: ['UNPAID', 'PARTIALLY_PAID'],
    pageSize: 100,
  });
  const shopsQ = useShopsList({ pageSize: 100 });
  const register = useRegisterPayment();

  const outstanding = summary.data?.outstanding ?? 0;

  // Default shopId: if all outstanding sales share one shop, pre-select it.
  const shopIds = useMemo(() => {
    const ids = [...new Set(unpaidSales.data?.items.map((s) => s.shopId) ?? [])];
    return ids;
  }, [unpaidSales.data]);

  const defaultShopId = shopIds.length === 1 ? (shopIds[0] ?? '') : '';
  const [shopId, setShopId] = useState('');
  const effectiveShopId = isOwner ? (shopId || defaultShopId) : assignedShopId;

  const [amount, setAmount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const plan = useMemo(() => {
    if (!amount || !unpaidSales.data) return [];
    return buildPlan(unpaidSales.data.items, amount);
  }, [amount, unpaidSales.data]);

  const loading =
    customer.isLoading || summary.isLoading || unpaidSales.isLoading;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-[14px] text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }

  if (!customer.data) return null;

  if (outstanding <= 0) {
    return (
      <div>
        <PageHeader
          title={customer.data.name}
          actions={
            <Link to={`/customers/${customerId}`}>
              <Button variant="secondary" size="sm">
                {t('payment.backToCustomer')}
              </Button>
            </Link>
          }
        />
        <p className="rounded-lg border border-line bg-surface p-4 text-[14px] text-muted">
          {t('payment.noOutstanding')}
        </p>
      </div>
    );
  }

  const activeShops = shopsQ.data?.items.filter((s) => s.active) ?? [];
  const needsShopPicker = isOwner && shopIds.length !== 1;

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!amount || amount <= 0) return;
    if (amount > outstanding) {
      setErrorMsg(t('payment.errorExceedsDebt'));
      return;
    }
    if (isOwner && !effectiveShopId) {
      setErrorMsg(t('payment.errorNoShop'));
      return;
    }
    try {
      const result = await register.mutateAsync({
        customerId: customerId ?? '',
        shopId: effectiveShopId,
        amount,
      });
      nav(`/payments/${result.id}/receipt`);
    } catch (e: unknown) {
      setErrorMsg(errorMessage(e, t));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('payment.title')}
        subtitle={customer.data.name}
        actions={
          <Link to={`/customers/${customerId}`}>
            <Button variant="secondary" size="sm">
              {t('payment.backToCustomer')}
            </Button>
          </Link>
        }
      />

      {/* Outstanding balance callout */}
      <SectionCard elevated className="mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold uppercase tracking-wide text-muted">
            {t('payment.outstanding')}
          </span>
          <Money value={outstanding} size="xl" />
        </div>
      </SectionCard>

      {/* Amount input */}
      <SectionCard className="mb-4">
        <MoneyInput
          label={t('payment.amount')}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setErrorMsg('');
          }}
          min={1}
        />

        {/* Shop picker — OWNER only, when sales span more than one shop */}
        {isOwner ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-[14px] font-semibold text-ink text-start">
              {t('payment.shopLabel')}
            </label>
            <select
              value={shopId || defaultShopId}
              onChange={(e) => setShopId(e.target.value)}
              className="h-11 w-full rounded-input border border-line bg-surface px-3 text-[14px] text-ink focus:border-brand focus:outline-none"
              style={{ display: needsShopPicker ? undefined : 'none' }}
            >
              <option value="">{t('payment.chooseShop')}</option>
              {activeShops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!needsShopPicker && defaultShopId ? (
              <p className="text-[13.5px] text-muted">
                {activeShops.find((s) => s.id === defaultShopId)?.name ?? defaultShopId}
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {/* Allocation preview */}
      {plan.length > 0 ? (
        <SectionCard title={t('payment.preview')} className="mb-4">
          <ul className="divide-y divide-line-soft">
            {plan.map((line) => (
              <li key={line.saleId} className="flex items-center justify-between gap-3 py-2.5 text-start">
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">
                    {line.saleReference}
                  </div>
                  <div className="text-[12px] text-muted">
                    {new Date(line.saleDate).toLocaleDateString()}
                    {' · '}
                    {t('customers.account.saleAmountDue')}: <Money value={line.amountDue} size="sm" showCurrency={false} />
                  </div>
                </div>
                <div className="text-end">
                  <Money value={line.allocated} size="sm" />
                  <div className={`text-[11.5px] font-medium ${line.settles ? 'text-collected' : 'text-muted'}`}>
                    {line.settles ? t('receipt.payment.settled') : t('receipt.payment.partial')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="text-[13px] text-muted">{t('payment.debtAfter')}</span>
            <Money value={outstanding - (amount ?? 0)} size="md" />
          </div>
        </SectionCard>
      ) : null}

      {errorMsg ? (
        <p role="alert" className="mb-3 rounded-input bg-debt-bg p-3 text-[13.5px] font-medium text-debt-fg">
          {errorMsg}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          loading={register.isPending}
          disabled={!amount || amount <= 0}
        >
          {t('payment.confirm')}
        </Button>
        <Link to={`/customers/${customerId}`}>
          <Button variant="secondary">{t('common.cancel')}</Button>
        </Link>
      </div>
    </div>
  );
}
