import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useLocationsList } from '@/features/locations/api';
import { CartPanel } from '../components/CartPanel';
import { CartProductPicker } from '../components/CartProductPicker';
import { CustomerPicker } from '../components/CustomerPicker';
import { useConfirmSale } from '../api';
import { cartReducer, initialCartState, totalAmount } from '../state';
import type { CreateSaleBody } from '../types';

// The sale flow — the app's hero screen (design brief §4.1). Two
// steps: cart (pick products, edit prices, qty) → payment (paid-now
// + customer). Reducer-based state; the moments the design brief
// calls out ("customer required when remaining > 0", "product
// exhausts") are state transitions in state.ts.
//
// SHOP users: the shop is pre-selected from their assigned shop.
// OWNER: shows a shop picker landing state before the cart appears.
// Server enforces shopId regardless — the picker is just UX.

export default function SellPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const me = useMe();
  const locations = useLocationsList();
  const confirm = useConfirmSale();

  const user = me.data?.user;
  const isOwner = user?.role === Role.OWNER;

  const shopLocations = useMemo(
    () =>
      (locations.data ?? []).filter((l) => l.type === 'SHOP' && l.active),
    [locations.data],
  );

  // Pre-fill the SHOP user's own shop; OWNER must pick.
  const ownShop = useMemo(() => {
    if (!user || user.role !== Role.SHOP || !user.assignedShopId) return null;
    const loc = shopLocations.find((l) => l.shopId === user.assignedShopId);
    return loc ? { shopId: user.assignedShopId, locationId: loc.id } : null;
  }, [user, shopLocations]);

  const initialShop = ownShop ?? { shopId: '', locationId: '' };
  const [state, dispatch] = useReducer(
    cartReducer,
    initialShop,
    ({ shopId, locationId }) => initialCartState(shopId, locationId),
  );

  // Locations load async — on the first mount the useReducer initializer
  // runs before `useLocationsList` has settled, so ownShop is null and
  // state.shopId is ''. Once the SHOP user's shop resolves, sync it in.
  useEffect(() => {
    if (ownShop && !state.shopId) {
      dispatch({
        type: 'SET_SHOP',
        shopId: ownShop.shopId,
        locationId: ownShop.locationId,
      });
    }
  }, [ownShop, state.shopId]);

  const cartProductIds = useMemo(
    () => new Set(state.items.map((i) => i.productId)),
    [state.items],
  );
  const total = totalAmount(state.items);
  const remaining = total - state.amountPaidAtSale;
  const needsCustomer = remaining > 0;
  const customerMissing = needsCustomer && state.customer === null;

  // Wait for locations before deciding — otherwise the SHOP user sees
  // the "no assigned shop" error during the first fetch window. Also
  // wait if ownShop is resolved but the sync effect hasn't fired yet,
  // otherwise the noAssignedShop branch flashes for a render.
  if (!state.shopId && (locations.isLoading || ownShop)) {
    return (
      <div>
        <PageHeader title={t('sell.title')} />
        <SectionCard>
          <div className="flex items-center gap-2 text-[14px] text-muted">
            <Spinner /> {t('loading')}
          </div>
        </SectionCard>
      </div>
    );
  }

  // OWNER landing state — needs to pick a shop first.
  if (isOwner && !state.shopId) {
    return (
      <div>
        <PageHeader
          title={t('sell.title')}
          subtitle={t('sell.subtitle')}
        />
        <SectionCard title={t('sell.ownerPickShop')}>
          <div className="grid gap-2 sm:grid-cols-2">
            {shopLocations.length === 0 ? (
              <p className="text-[14px] text-muted">
                {t('sell.noShops')}
              </p>
            ) : (
              shopLocations.map((l) => (
                <Button
                  key={l.id}
                  variant="secondary"
                  onClick={() =>
                    dispatch({
                      type: 'SET_SHOP',
                      shopId: l.shopId!,
                      locationId: l.id,
                    })
                  }
                  className="w-full !justify-start"
                >
                  {l.name}
                </Button>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    );
  }

  // SHOP user without an assigned shop — corrupt state; server would
  // reject anyway. Render an explanation instead of a broken cart.
  if (!state.shopId) {
    return (
      <div>
        <PageHeader title={t('sell.title')} />
        <SectionCard>
          <p className="text-[14px] text-debt-fg">{t('sell.noAssignedShop')}</p>
        </SectionCard>
      </div>
    );
  }

  const canGoToPayment = state.items.length > 0;
  const canConfirm =
    state.items.length > 0 && !customerMissing && !confirm.isPending;

  const submit = async () => {
    const body: CreateSaleBody = {
      shopId: state.shopId,
      amountPaidAtSale: state.amountPaidAtSale,
      items: state.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    };
    if (state.customer?.kind === 'existing') {
      body.customerId = state.customer.id;
    } else if (state.customer?.kind === 'new') {
      body.newCustomer = {
        name: state.customer.name,
        phone: state.customer.phone,
      };
    }
    try {
      const sale = await confirm.mutateAsync(body);
      nav(`/sell/${sale.id}/confirmation`, { replace: true });
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div>
      <PageHeader
        title={
          state.step === 'cart' ? t('sell.stepCartTitle') : t('sell.stepPaymentTitle')
        }
        subtitle={
          isOwner
            ? shopLocations.find((l) => l.shopId === state.shopId)?.name
            : undefined
        }
        actions={
          state.step === 'payment' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'SET_STEP', step: 'cart' })}
            >
              {t('sell.backToCart')}
            </Button>
          ) : isOwner ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                dispatch({
                  type: 'RESET',
                  shopId: '',
                  locationId: '',
                })
              }
            >
              {t('sell.switchShop')}
            </Button>
          ) : null
        }
      />

      {state.step === 'cart' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <SectionCard title={t('sell.cart.pickTitle')}>
            <CartProductPicker
              locationId={state.locationId}
              cartProductIds={cartProductIds}
              onAdd={(product) => dispatch({ type: 'ADD_LINE', product })}
            />
          </SectionCard>

          <div className="flex flex-col gap-3">
            <SectionCard title={t('sell.cart.title')}>
              <CartPanel
                items={state.items}
                onSetQty={(productId, quantity) =>
                  dispatch({ type: 'SET_QTY', productId, quantity })
                }
                onSetPrice={(productId, unitPrice) =>
                  dispatch({ type: 'SET_PRICE', productId, unitPrice })
                }
                onRemove={(productId) =>
                  dispatch({ type: 'REMOVE_LINE', productId })
                }
              />
            </SectionCard>
            <Button
              disabled={!canGoToPayment}
              onClick={() => dispatch({ type: 'SET_STEP', step: 'payment' })}
              className="!h-14 !text-[16px]"
            >
              {t('sell.goToPayment')}
            </Button>
          </div>
        </div>
      ) : (
        <PaymentStep
          total={total}
          amountPaidAtSale={state.amountPaidAtSale}
          onSetPaid={(amount) => dispatch({ type: 'SET_PAID_NOW', amount })}
          onPayFull={() => dispatch({ type: 'PAY_FULL' })}
          customer={state.customer}
          onPickExisting={(c) =>
            dispatch({
              type: 'SET_EXISTING_CUSTOMER',
              id: c.id,
              name: c.name,
              phone: c.phone,
            })
          }
          onCreateNew={(c) =>
            dispatch({ type: 'SET_NEW_CUSTOMER', name: c.name, phone: c.phone })
          }
          onClearCustomer={() => dispatch({ type: 'CLEAR_CUSTOMER' })}
          customerMissing={customerMissing}
          canConfirm={canConfirm}
          isSubmitting={confirm.isPending}
          errorMessage={
            confirm.error ? errorMessage(confirm.error, t) : null
          }
          onSubmit={submit}
        />
      )}
    </div>
  );
}

type PaymentStepProps = {
  total: number;
  amountPaidAtSale: number;
  onSetPaid: (n: number) => void;
  onPayFull: () => void;
  customer: import('../state').CustomerChoice | null;
  onPickExisting: (c: { id: string; name: string; phone: string | null }) => void;
  onCreateNew: (c: { name: string; phone: string | null }) => void;
  onClearCustomer: () => void;
  customerMissing: boolean;
  canConfirm: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
};

function PaymentStep({
  total,
  amountPaidAtSale,
  onSetPaid,
  onPayFull,
  customer,
  onPickExisting,
  onCreateNew,
  onClearCustomer,
  customerMissing,
  canConfirm,
  isSubmitting,
  errorMessage,
  onSubmit,
}: PaymentStepProps) {
  const { t } = useTranslation();
  const remaining = total - amountPaidAtSale;
  const [showQuick, setShowQuick] = useState(true);
  // Quick-buttons offer 25/50/75/100% of total as one-tap presets so a
  // clerk under counter pressure doesn't have to type the full amount.
  const presets = useMemo(
    () => {
      if (total === 0) return [];
      return [0.25, 0.5, 0.75, 1].map((p) => Math.floor(total * p));
    },
    [total],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex flex-col gap-3">
        <SectionCard title={t('sell.payment.title')}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-baseline justify-between rounded-input bg-tint px-3 py-2">
                <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                  {t('sell.payment.total')}
                </span>
                <Money value={total} size="lg" />
              </div>
              <div
                className={
                  'flex items-baseline justify-between rounded-input px-3 py-2 ' +
                  (remaining > 0
                    ? 'bg-debt-bg text-debt-fg'
                    : 'bg-collected-bg text-collected-fg')
                }
              >
                <span className="text-[13px] font-semibold uppercase tracking-wide">
                  {t('sell.payment.remaining')}
                </span>
                <Money value={remaining} size="lg" />
              </div>
            </div>

            <MoneyInput
              label={t('sell.payment.paidNow')}
              value={amountPaidAtSale}
              onChange={(v) => onSetPaid(v ?? 0)}
            />
            {showQuick && presets.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {presets.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSetPaid(preset)}
                    className="rounded-input border border-[#C8C9D4] bg-surface px-3 py-2 text-[13.5px] font-semibold text-brand transition-colors hover:bg-tint"
                  >
                    {i === 3
                      ? t('sell.payment.payFull')
                      : `${(i + 1) * 25}%`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onSetPaid(0);
                    setShowQuick(false);
                  }}
                  className="rounded-input border border-[#C8C9D4] bg-surface px-3 py-2 text-[13.5px] font-semibold text-muted transition-colors hover:bg-tint"
                >
                  0
                </button>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title={t('sell.customer.title')}>
          <CustomerPicker
            value={customer}
            onPickExisting={onPickExisting}
            onCreateNew={onCreateNew}
            onClear={onClearCustomer}
            required={customerMissing}
          />
        </SectionCard>
      </div>

      <div className="flex flex-col gap-3">
        <SectionCard title={t('sell.payment.summary')}>
          <div className="flex flex-col gap-2 text-[14px]">
            <SummaryRow
              label={t('sell.payment.summaryTotal')}
              value={<Money value={total} size="sm" />}
            />
            <SummaryRow
              label={t('sell.payment.summaryPaid')}
              value={<Money value={amountPaidAtSale} size="sm" className="text-collected-fg" />}
            />
            <SummaryRow
              label={t('sell.payment.summaryRemaining')}
              value={<Money value={remaining} size="sm" className={remaining > 0 ? 'text-debt-fg' : ''} />}
            />
            <div className="my-1 border-t border-line-soft" />
            <SummaryRow
              label={t('sell.payment.summaryCustomer')}
              value={
                <span className="text-[13.5px] font-semibold text-ink">
                  {customer ? customer.name : t('sell.payment.summaryNoCustomer')}
                </span>
              }
            />
          </div>
        </SectionCard>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-input bg-debt-bg px-3 py-2 text-[14px] font-medium text-debt-fg"
          >
            {errorMessage}
          </p>
        ) : null}

        <Button
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={!canConfirm}
          className="!h-14 !text-[16px]"
        >
          {t('sell.confirmSale')}
        </Button>

        <Button
          variant="ghost"
          onClick={onPayFull}
          disabled={isSubmitting || total === 0 || amountPaidAtSale === total}
          className="!h-11"
        >
          {t('sell.payment.markPayFull')}
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-muted">{label}</span>
      {value}
    </div>
  );
}
