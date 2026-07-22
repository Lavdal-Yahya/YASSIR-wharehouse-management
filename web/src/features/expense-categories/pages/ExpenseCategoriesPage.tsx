import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import {
  useArchiveExpenseCategory,
  useCreateExpenseCategory,
  useExpenseCategoriesList,
  useRestoreExpenseCategory,
  useUpdateExpenseCategory,
} from '../api';
import type { ExpenseCategory } from '../types';

const schema = z.object({ name: z.string().trim().min(1).max(80) });
type FormValues = z.infer<typeof schema>;

export default function ExpenseCategoriesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);

  const list = useExpenseCategoriesList({ page, pageSize: 25, search, includeArchived });
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const archive = useArchiveExpenseCategory();
  const restore = useRestoreExpenseCategory();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '' } });

  const startCreate = () => { setEditing(null); form.reset({ name: '' }); };
  const startEdit = (c: ExpenseCategory) => { setEditing(c); form.reset({ name: c.name }); };

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, name });
      else await create.mutateAsync({ name });
      startCreate();
    } catch { /* surfaced */ }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  return (
    <div>
      <PageHeader
        title={t('expenseCategories.title')}
        subtitle={t('expenseCategories.subtitle')}
        actions={
          <Link to="/settings">
            <Button variant="secondary">{t('common.backToSettings')}</Button>
          </Link>
        }
      />

      <section className="mb-6 rounded-lg border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink text-start">
          {editing ? t('expenseCategories.form.editTitle') : t('expenseCategories.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grow">
            <Input
              label={t('expenseCategories.form.name')}
              autoFocus
              {...form.register('name')}
              error={form.formState.errors.name ? t('errors.BAD_REQUEST') : undefined}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={mutating}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
            {editing ? (
              <Button type="button" variant="secondary" onClick={startCreate} disabled={mutating}>
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
        {mutationError ? (
          <p role="alert" className="mt-3 rounded-md bg-debt-bg px-3 py-2 text-sm text-debt-fg">
            {errorMessage(mutationError, t)}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grow md:max-w-sm">
            <SearchInput value={search} onChange={(v) => { setPage(1); setSearch(v); }} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
            />
            {t('common.includeArchived')}
          </label>
        </div>

        {list.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="text-sm text-debt-fg">{errorMessage(list.error, t)}</p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="text-sm text-muted">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.data?.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-start">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">{c.name}</span>
                  {c.active ? null : <StatusBadge tone="muted">{t('common.archived')}</StatusBadge>}
                </div>
                <div className="flex items-center gap-2">
                  {c.active ? (
                    <>
                      <Button variant="secondary" onClick={() => startEdit(c)}>{t('common.edit')}</Button>
                      <Button
                        variant="ghost"
                        onClick={() => archive.mutate(c.id)}
                        loading={archive.isPending && archive.variables === c.id}
                      >
                        {t('common.archive')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => restore.mutate(c.id)}
                      loading={restore.isPending && restore.variables === c.id}
                    >
                      {t('common.restore')}
                    </Button>
                  )}
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
    </div>
  );
}
