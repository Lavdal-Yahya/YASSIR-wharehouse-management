import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SearchInput } from '@/components/SearchInput';
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
import { useExpenseCategoriesList } from '@/features/expense-categories/api';
import {
  useCancelExpense,
  useCreateExpense,
  useExpensesList,
  useUpdateExpense,
} from '../api';
import type { Expense, ExpenseStatus } from '../types';

// Expenses UI (P7-02) — ledger design. Split-panel: create/edit form
// on top (in a SectionCard), filterable list below (also SectionCard),
// ConfirmDialog for cancel-with-reason. SHOP users get their shopId
// implicit — dropdown hidden.

const schema = z.object({
  shopId: z.string().min(1),
  categoryId: z.string().nullable(),
  amount: z.number().int().min(1),
  expenseDate: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).nullable(),
});
type FormValues = z.infer<typeof schema>;
const empty = (defaultShopId: string): FormValues => ({
  shopId: defaultShopId,
  categoryId: null,
  amount: 0,
  expenseDate: todayIso(),
  description: '',
  notes: null,
});

const STATUSES: ExpenseStatus[] = ['ACTIVE', 'CANCELLED'];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const selectClass =
  'h-[50px] rounded-input border-[1.5px] border-[#C8C9D4] bg-surface px-3 text-[15px] text-ink focus:outline focus:outline-2 focus:outline-brand disabled:bg-neutral-bg';

export default function ExpensesListPage() {
  const { t } = useTranslation();
  const me = useMe();
  const user = me.data?.user;
  const role = user?.role;
  const isOwner = role === Role.OWNER;
  const isShop = role === Role.SHOP;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ExpenseStatus>('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const shops = useShopsList({ page: 1, pageSize: 100 });
  const categories = useExpenseCategoriesList({ page: 1, pageSize: 100 });
  const list = useExpensesList({
    page,
    pageSize: 25,
    search: search || undefined,
    shopId: isShop ? undefined : shopFilter || undefined,
    categoryId: categoryFilter || undefined,
    status: statusFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
  });
  const create = useCreateExpense();
  const update = useUpdateExpense(editing?.id ?? '');
  const cancel = useCancelExpense();

  const defaultShopId = isShop && user?.assignedShopId ? user.assignedShopId : '';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: empty(defaultShopId),
  });

  const startCreate = () => {
    setEditing(null);
    form.reset(empty(defaultShopId));
  };
  const startEdit = (e: Expense) => {
    setEditing(e);
    form.reset({
      shopId: e.shopId,
      categoryId: e.categoryId,
      amount: e.amount,
      expenseDate: e.expenseDate.slice(0, 10),
      description: e.description,
      notes: e.notes,
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({
          categoryId: values.categoryId,
          amount: values.amount,
          expenseDate: values.expenseDate,
          description: values.description,
          notes: values.notes,
        });
      } else {
        await create.mutateAsync({
          shopId: values.shopId,
          categoryId: values.categoryId ?? undefined,
          amount: values.amount,
          expenseDate: values.expenseDate,
          description: values.description,
          notes: values.notes,
        });
      }
      startCreate();
    } catch {
      /* surfaced via mutationError */
    }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  const toneFor = (s: ExpenseStatus) => (s === 'ACTIVE' ? 'ok' : 'muted');

  return (
    <div>
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
      />

      <SectionCard
        title={editing ? t('expenses.form.editTitle') : t('expenses.form.createTitle')}
        className="mb-5"
      >
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          {!isShop ? (
            <div className="flex flex-col gap-1.5 text-start">
              <label className="text-[14px] font-semibold text-ink">
                {t('expenses.form.shop')}
              </label>
              <select
                {...form.register('shopId')}
                disabled={!!editing}
                className={selectClass}
              >
                <option value="">{t('expenses.form.chooseShop')}</option>
                {shops.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 text-start">
            <label className="text-[14px] font-semibold text-ink">
              {t('expenses.form.category')}
            </label>
            <select
              value={form.watch('categoryId') ?? ''}
              onChange={(e) =>
                form.setValue(
                  'categoryId',
                  e.target.value === '' ? null : e.target.value,
                )
              }
              className={selectClass}
            >
              <option value="">{t('expenses.form.chooseCategory')}</option>
              {categories.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <MoneyInput
            label={t('expenses.form.amount')}
            value={form.watch('amount') || null}
            onChange={(v) => form.setValue('amount', v ?? 0, { shouldValidate: true })}
            error={form.formState.errors.amount ? t('errors.BAD_REQUEST') : undefined}
          />
          <Input
            type="date"
            label={t('expenses.form.date')}
            {...form.register('expenseDate')}
          />
          <div className="md:col-span-2">
            <Input
              label={t('expenses.form.description')}
              {...form.register('description')}
              error={
                form.formState.errors.description ? t('errors.BAD_REQUEST') : undefined
              }
            />
          </div>
          <div className="md:col-span-3">
            <Input
              label={
                <>
                  {t('expenses.form.notes')}{' '}
                  <span className="text-[13px] font-medium text-muted">
                    ({t('common.optional')})
                  </span>
                </>
              }
              {...form.register('notes', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            {editing ? (
              <Button
                type="button"
                variant="secondary"
                onClick={startCreate}
                disabled={mutating}
              >
                {t('common.cancel')}
              </Button>
            ) : null}
            <Button type="submit" loading={mutating}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </div>
          {mutationError ? (
            <p
              role="alert"
              className="md:col-span-3 rounded-input bg-debt-bg px-3 py-2 text-[14px] font-medium text-debt-fg"
            >
              {errorMessage(mutationError, t)}
            </p>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard>
        <div className="mb-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setPage(1);
                setSearch(v);
              }}
              placeholder={t('expenses.searchPlaceholder')}
            />
          </div>
          {!isShop ? (
            <select
              value={shopFilter}
              onChange={(e) => {
                setPage(1);
                setShopFilter(e.target.value);
              }}
              className={selectClass}
              aria-label={t('expenses.filter.shop')}
            >
              <option value="">{t('expenses.filter.allShops')}</option>
              {shops.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setPage(1);
              setCategoryFilter(e.target.value);
            }}
            className={selectClass}
            aria-label={t('expenses.filter.category')}
          >
            <option value="">{t('expenses.filter.allCategories')}</option>
            {categories.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as '' | ExpenseStatus);
            }}
            className={selectClass}
            aria-label={t('expenses.filter.status')}
          >
            <option value="">{t('expenses.filter.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`expenses.status.${s}`)}
              </option>
            ))}
          </select>
          <div className="flex items-end gap-2 md:col-span-2">
            <div className="grow">
              <Input
                type="date"
                label={t('expenses.filter.from')}
                value={fromFilter}
                onChange={(e) => {
                  setPage(1);
                  setFromFilter(e.target.value);
                }}
              />
            </div>
            <div className="grow">
              <Input
                type="date"
                label={t('expenses.filter.to')}
                value={toFilter}
                onChange={(e) => {
                  setPage(1);
                  setToFilter(e.target.value);
                }}
              />
            </div>
          </div>
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
            {list.data?.items.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 py-3 text-start"
              >
                <div className="min-w-0 grow">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">
                      {e.referenceNumber}
                    </span>
                    <StatusBadge tone={toneFor(e.status)}>
                      {t(`expenses.status.${e.status}`)}
                    </StatusBadge>
                  </div>
                  <div className="text-[13px] text-muted">
                    {new Date(e.expenseDate).toLocaleDateString()} · {e.shopName}
                    {e.categoryName ? <> · {e.categoryName}</> : null}
                  </div>
                  <div className="mt-1 text-[14px] text-ink">{e.description}</div>
                </div>
                <div className="text-end">
                  <Money value={e.amount} size="md" />
                </div>
                <div className="flex items-center gap-2">
                  {e.status === 'ACTIVE' ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(e)}
                      >
                        {t('common.edit')}
                      </Button>
                      {isOwner || isShop ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancelTarget(e);
                            setCancelReason('');
                          }}
                          className="!text-debt-fg hover:!bg-debt-bg"
                        >
                          {t('expenses.cancelConfirm.button')}
                        </Button>
                      ) : null}
                    </>
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
        title={t('expenses.cancelConfirm.title')}
        body={
          <div className="flex flex-col gap-3">
            <p>{t('expenses.cancelConfirm.body')}</p>
            <Input
              label={t('expenses.cancelConfirm.reason')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('expenses.cancelConfirm.reasonPlaceholder')}
              error={cancel.error ? errorMessage(cancel.error, t) : undefined}
            />
          </div>
        }
        confirmLabel={t('expenses.cancelConfirm.confirm')}
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
