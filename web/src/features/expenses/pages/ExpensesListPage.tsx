import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Role } from '@/shared/enums';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { MoneyInput } from '@/components/MoneyInput';
import { Spinner } from '@/components/Spinner';
import { formatMoney } from '@/shared/money';
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

// Expenses UI (P7-02). Follows the CustomersPage split-panel pattern:
// create/edit form on top, filterable list below, ConfirmDialog for
// the cancel-with-reason flow. Shop employees see only their own
// shop (ShopScopeGuard + service list() defensively re-constrains);
// the shop dropdown is hidden for them and their shopId is implied.

// zod schema mirrors CreateExpenseDto server-side. amount ≥ 1 matches
// the DB CHECK expense_amount_positive. Note we can't share the DTO
// class from /api — that's the "duplicated shared enums" tradeoff
// from D-001 (§2). Keep both in sync by hand.
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

  // Default shopId for the form: SHOP user's own shop; OWNER picks
  // from the dropdown (blank until first selection).
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
        // shopId is intentionally not in the PATCH body — the server
        // rejects moving an expense between shops (would silently
        // rewrite cash-outflow attribution).
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
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')} />

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 text-start">
          {editing ? t('expenses.form.editTitle') : t('expenses.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          {/* Shop — hidden for SHOP users; OWNER picks. Edit mode locks
              the shop (server refuses shopId in PATCH anyway). */}
          {!isShop ? (
            <div className="flex flex-col gap-1 text-start">
              <label className="text-sm font-medium text-slate-700">
                {t('expenses.form.shop')}
              </label>
              <select
                {...form.register('shopId')}
                disabled={!!editing}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
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
          <div className="flex flex-col gap-1 text-start">
            <label className="text-sm font-medium text-slate-700">
              {t('expenses.form.category')}
            </label>
            <select
              value={form.watch('categoryId') ?? ''}
              onChange={(e) =>
                form.setValue('categoryId', e.target.value === '' ? null : e.target.value)
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">{t('expenses.form.chooseCategory')}</option>
              {categories.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <MoneyInput
              label={t('expenses.form.amount')}
              value={form.watch('amount') || null}
              onChange={(v) => form.setValue('amount', v ?? 0, { shouldValidate: true })}
              error={form.formState.errors.amount ? t('errors.BAD_REQUEST') : undefined}
            />
          </div>
          <Input
            type="date"
            label={t('expenses.form.date')}
            {...form.register('expenseDate')}
          />
          <div className="md:col-span-2">
            <Input
              label={t('expenses.form.description')}
              {...form.register('description')}
              error={form.formState.errors.description ? t('errors.BAD_REQUEST') : undefined}
            />
          </div>
          <div className="md:col-span-3">
            <Input
              label={
                <>
                  {t('expenses.form.notes')}{' '}
                  <span className="text-xs text-slate-400">({t('common.optional')})</span>
                </>
              }
              {...form.register('notes', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            {editing ? (
              <Button type="button" variant="secondary" onClick={startCreate} disabled={mutating}>
                {t('common.cancel')}
              </Button>
            ) : null}
            <Button type="submit" loading={mutating}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </div>
          {mutationError ? (
            <p role="alert" className="md:col-span-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage(mutationError, t)}
            </p>
          ) : null}
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 grid gap-3 md:grid-cols-6">
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
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage(list.error, t)}
          </p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data?.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3 text-start">
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {e.referenceNumber}
                    </span>
                    <StatusBadge tone={toneFor(e.status)}>
                      {t(`expenses.status.${e.status}`)}
                    </StatusBadge>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(e.expenseDate).toLocaleDateString()} · {e.shopName}
                    {e.categoryName ? <> · {e.categoryName}</> : null}
                  </div>
                  <div className="text-sm text-slate-700 mt-1">{e.description}</div>
                </div>
                <div className="text-end text-sm font-semibold text-slate-900 tabular-nums">
                  {formatMoney(e.amount)}
                </div>
                <div className="flex items-center gap-2">
                  {e.status === 'ACTIVE' ? (
                    <>
                      <Button variant="secondary" onClick={() => startEdit(e)}>
                        {t('common.edit')}
                      </Button>
                      {isOwner || isShop ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setCancelTarget(e);
                            setCancelReason('');
                          }}
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
      </section>

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
              error={
                cancel.error ? errorMessage(cancel.error, t) : undefined
              }
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
