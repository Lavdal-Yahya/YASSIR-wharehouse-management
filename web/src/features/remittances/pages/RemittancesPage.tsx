import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { MoneyInput } from '@/components/MoneyInput';
import { Money } from '@/components/Money';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useMe } from '@/features/auth/api';
import { useShopsList } from '@/features/shops/api';
import {
  useCancelRemittance,
  useCashOnHand,
  useCreateRemittance,
  useRemittancesList,
} from '../api';
import type { Remittance, RemittanceStatus } from '../types';

// Cash remittances (shop → central warehouse). Top of page: cash-on-hand
// snapshot per shop + warehouse balance (owner/warehouse only). Middle:
// "Remettre au dépôt" form, pre-filled with the caller's current
// cash-on-hand so the default action is a full flush. Bottom: history
// list with cancel-with-reason (OWNER only per product decision).

const schema = z.object({
  shopId: z.string().min(1),
  amount: z.number().int().min(1),
  remittanceDate: z.string().min(1),
  notes: z.string().trim().max(2000).nullable(),
});
type FormValues = z.infer<typeof schema>;

const STATUSES: RemittanceStatus[] = ['ACTIVE', 'CANCELLED'];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const selectClass =
  'h-[50px] rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-[15px] text-ink focus:outline focus:outline-2 focus:outline-brand disabled:bg-neutral-bg';

export default function RemittancesPage() {
  const { t } = useTranslation();
  const me = useMe();
  const user = me.data?.user;
  const role = user?.role;
  const isOwner = role === Role.OWNER;
  const isShop = role === Role.SHOP;

  const [page, setPage] = useState(1);
  const [shopFilter, setShopFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | RemittanceStatus>('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Remittance | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const cash = useCashOnHand();
  const shops = useShopsList({ page: 1, pageSize: 100 });
  const list = useRemittancesList({
    page,
    pageSize: 25,
    shopId: isShop ? undefined : shopFilter || undefined,
    status: statusFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
  });
  const create = useCreateRemittance();
  const cancel = useCancelRemittance();

  const defaultShopId = isShop && user?.assignedShopId ? user.assignedShopId : '';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      shopId: defaultShopId,
      amount: 0,
      remittanceDate: todayIso(),
      notes: null,
    },
  });

  const selectedShopId = form.watch('shopId');
  const selectedShopCash =
    cash.data?.shops.find((s) => s.shopId === selectedShopId)?.cashOnHand ?? 0;

  // Auto-populate amount = cash-on-hand for the selected shop whenever the
  // shop or cash snapshot changes AND the field hasn't been manually edited
  // (dirty). Feels like "click to flush" without locking the input.
  useEffect(() => {
    if (form.formState.dirtyFields.amount) return;
    if (selectedShopCash > 0) {
      form.setValue('amount', selectedShopCash, { shouldDirty: false });
    }
    // Deliberately watching only selectedShopCash + selectedShopId — resetting
    // dirty on every render would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShopCash, selectedShopId]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        shopId: values.shopId,
        amount: values.amount,
        remittanceDate: values.remittanceDate,
        notes: values.notes,
      });
      form.reset({
        shopId: values.shopId,
        amount: 0,
        remittanceDate: todayIso(),
        notes: null,
      });
    } catch {
      /* surfaced via mutationError */
    }
  });

  const toneFor = (s: RemittanceStatus) => (s === 'ACTIVE' ? 'ok' : 'muted');

  return (
    <div>
      <PageHeader
        title={t('remittances.title')}
        subtitle={t('remittances.subtitle')}
      />

      {/* Cash-on-hand strip. Warehouse tile only when role can see it. */}
      <SectionCard className="mb-5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cash.data?.warehouseCash !== null && cash.data?.warehouseCash !== undefined ? (
            <div className="rounded-lg border border-line bg-collected-bg px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-wide text-collected">
                {t('remittances.warehouseCash')}
              </div>
              <div className="mt-1"><Money value={cash.data.warehouseCash} size="lg" /></div>
            </div>
          ) : null}
          {cash.data?.shops.map((s) => (
            <div key={s.shopId} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                {s.shopName}
              </div>
              <div className="mt-1"><Money value={s.cashOnHand} size="lg" /></div>
              <div className="text-[12px] text-muted">
                {t('remittances.shopCashOnHand')}
              </div>
            </div>
          ))}
          {cash.isLoading ? (
            <div className="flex items-center gap-2 text-[14px] text-muted">
              <Spinner /> {t('loading')}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t('remittances.form.title')} className="mb-5">
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          {!isShop ? (
            <div className="flex flex-col gap-1.5 text-start">
              <label className="text-[14px] font-semibold text-ink">
                {t('remittances.form.shop')}
              </label>
              <select {...form.register('shopId')} className={selectClass}>
                <option value="">{t('remittances.form.chooseShop')}</option>
                {shops.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <MoneyInput
            label={t('remittances.form.amount')}
            value={form.watch('amount')}
            onChange={(v) =>
              form.setValue('amount', v ?? 0, { shouldDirty: true })
            }
            max={selectedShopCash > 0 ? selectedShopCash : undefined}
          />
          <Input
            type="date"
            label={t('remittances.form.date')}
            {...form.register('remittanceDate')}
          />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-ink text-start" htmlFor="rem-notes">
              {t('remittances.form.notes')}{' '}
              <span className="text-xs text-muted">({t('optional')})</span>
            </label>
            <textarea
              id="rem-notes"
              rows={2}
              className="mt-1 w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink focus:outline focus:outline-2 focus:outline-brand"
              {...form.register('notes', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </div>
          {create.error ? (
            <p role="alert" className="md:col-span-2 text-[13px] text-debt-fg">
              {errorMessage(create.error, t)}
            </p>
          ) : null}
          {selectedShopCash > 0 && form.watch('amount') === selectedShopCash ? (
            <p className="md:col-span-2 text-[12px] text-muted">
              {t('remittances.form.flushHint')}
            </p>
          ) : null}
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={create.isPending || form.watch('amount') <= 0}>
              {create.isPending ? t('common.saving') : t('remittances.form.submit')}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={t('remittances.history.title')}>
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          {!isShop ? (
            <select
              value={shopFilter}
              onChange={(e) => {
                setPage(1);
                setShopFilter(e.target.value);
              }}
              className={selectClass}
              aria-label={t('remittances.filter.shop')}
            >
              <option value="">{t('remittances.filter.allShops')}</option>
              {shops.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as '' | RemittanceStatus);
            }}
            className={selectClass}
            aria-label={t('remittances.filter.status')}
          >
            <option value="">{t('remittances.filter.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`remittances.status.${s}`)}
              </option>
            ))}
          </select>
          <Input
            type="date"
            label={t('remittances.filter.from')}
            value={fromFilter}
            onChange={(e) => {
              setPage(1);
              setFromFilter(e.target.value);
            }}
          />
          <Input
            type="date"
            label={t('remittances.filter.to')}
            value={toFilter}
            onChange={(e) => {
              setPage(1);
              setToFilter(e.target.value);
            }}
          />
        </div>

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
            {list.data?.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-start">
                <div className="min-w-0 grow">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">
                      {r.referenceNumber}
                    </span>
                    <StatusBadge tone={toneFor(r.status)}>
                      {t(`remittances.status.${r.status}`)}
                    </StatusBadge>
                  </div>
                  <div className="text-[13px] text-muted">
                    {new Date(r.remittanceDate).toLocaleDateString()} · {r.shopName}
                  </div>
                  {r.notes ? (
                    <div className="mt-1 text-[13px] text-ink">{r.notes}</div>
                  ) : null}
                  {r.status === 'CANCELLED' && r.cancellationReason ? (
                    <div className="mt-1 text-[12px] text-debt-fg">
                      {t('remittances.history.cancelledReason', {
                        reason: r.cancellationReason,
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="text-end">
                  <Money value={r.amount} size="md" />
                </div>
                <div className="flex items-center gap-2">
                  {r.status === 'ACTIVE' && isOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCancelTarget(r);
                        setCancelReason('');
                      }}
                      className="!text-debt-fg hover:!bg-debt-bg"
                    >
                      {t('remittances.cancelConfirm.button')}
                    </Button>
                  ) : null}
                </div>
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

      <ConfirmDialog
        open={!!cancelTarget}
        title={t('remittances.cancelConfirm.title')}
        body={
          <div className="flex flex-col gap-3">
            <p>{t('remittances.cancelConfirm.body')}</p>
            <Input
              label={t('remittances.cancelConfirm.reason')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('remittances.cancelConfirm.reasonPlaceholder')}
              error={cancel.error ? errorMessage(cancel.error, t) : undefined}
            />
          </div>
        }
        confirmLabel={t('remittances.cancelConfirm.confirm')}
        danger
        loading={cancel.isPending}
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          const reason = cancelReason.trim();
          if (reason === '') return;
          try {
            await cancel.mutateAsync({ id: cancelTarget.id, reason });
            setCancelTarget(null);
            setCancelReason('');
          } catch {
            /* surfaced inside dialog */
          }
        }}
      />
    </div>
  );
}
