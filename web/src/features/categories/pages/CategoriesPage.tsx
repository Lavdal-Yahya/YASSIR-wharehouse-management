import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import {
  useArchiveCategory,
  useCategoriesList,
  useCreateCategory,
  useRestoreCategory,
  useUpdateCategory,
} from '../api';
import type { Category } from '../types';

const schema = z.object({ name: z.string().trim().min(1).max(80) });
type FormValues = z.infer<typeof schema>;

export default function CategoriesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);

  const list = useCategoriesList({ page, pageSize: 25, search, includeArchived });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const archive = useArchiveCategory();
  const restore = useRestoreCategory();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const startCreate = () => {
    setEditing(null);
    form.reset({ name: '' });
  };
  const startEdit = (c: Category) => {
    setEditing(c);
    form.reset({ name: c.name });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, name: values.name });
      } else {
        await create.mutateAsync({ name: values.name });
      }
      startCreate();
    } catch {
      /* surfaced below */
    }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = (create.error ?? update.error) as unknown;

  return (
    <div>
      <PageHeader title={t('categories.title')} subtitle={t('categories.subtitle')} />

      <section
        aria-label={t('categories.form.title')}
        className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-800 text-start">
          {editing ? t('categories.form.editTitle') : t('categories.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grow">
            <Input
              label={t('categories.form.name')}
              placeholder={t('categories.form.namePlaceholder')}
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
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(mutationError, t)}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grow md:max-w-sm">
            <SearchInput value={search} onChange={(v) => { setPage(1); setSearch(v); }} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
            />
            {t('common.includeArchived')}
          </label>
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
            {list.data?.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-start">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-900">{c.name}</span>
                  {c.active ? null : (
                    <StatusBadge tone="muted">{t('common.archived')}</StatusBadge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.active ? (
                    <>
                      <Button variant="secondary" onClick={() => startEdit(c)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" onClick={() => setArchiveTarget(c)}>
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

      <ConfirmDialog
        open={!!archiveTarget}
        title={t('categories.archiveConfirm.title')}
        body={t('categories.archiveConfirm.body', { name: archiveTarget?.name })}
        confirmLabel={t('common.archive')}
        loading={archive.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive.mutateAsync(archiveTarget.id);
            setArchiveTarget(null);
          } catch {
            /* surfaced next render */
          }
        }}
      />
    </div>
  );
}
