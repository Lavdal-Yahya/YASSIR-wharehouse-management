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
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useMe } from '@/features/auth/api';
import {
  useArchiveCustomer,
  useCreateCustomer,
  useCustomersList,
  useRestoreCustomer,
  useUpdateCustomer,
} from '../api';
import type { Customer } from '../types';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { name: '', phone: null, notes: null };

export default function CustomersPage() {
  const { t } = useTranslation();
  const me = useMe();
  const role = me.data?.user.role;
  const isOwner = role === Role.OWNER;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);

  const list = useCustomersList({ page, pageSize: 25, search, includeArchived });
  const create = useCreateCustomer();
  const update = useUpdateCustomer(editing?.id ?? '');
  const archive = useArchiveCustomer();
  const restore = useRestoreCustomer();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const startCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
  };
  const startEdit = (c: Customer) => {
    setEditing(c);
    form.reset({ name: c.name, phone: c.phone, notes: c.notes });
  };

  const canEdit = (c: Customer) =>
    isOwner || role === Role.SHOP; // shop employees can edit customer info

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      phone: values.phone ?? null,
      notes: values.notes ?? null,
    };
    try {
      if (editing) await update.mutateAsync(body);
      else await create.mutateAsync(body);
      startCreate();
    } catch {
      /* surfaced */
    }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  return (
    <div>
      <PageHeader title={t('customers.title')} subtitle={t('customers.subtitle')} />

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 text-start">
          {editing ? t('customers.form.editTitle') : t('customers.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Input
            label={t('customers.form.name')}
            {...form.register('name')}
            error={form.formState.errors.name ? t('errors.BAD_REQUEST') : undefined}
          />
          <Input
            label={<>{t('customers.form.phone')} <span className="text-xs text-slate-400">({t('common.optional')})</span></>}
            {...form.register('phone', { setValueAs: (v) => (v === '' ? null : v) })}
          />
          <Input
            label={<>{t('customers.form.notes')} <span className="text-xs text-slate-400">({t('common.optional')})</span></>}
            {...form.register('notes', { setValueAs: (v) => (v === '' ? null : v) })}
          />
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
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grow md:max-w-sm">
            <SearchInput
              value={search}
              onChange={(v) => { setPage(1); setSearch(v); }}
              placeholder={t('customers.searchPlaceholder')}
            />
          </div>
          {isOwner ? (
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => { setPage(1); setIncludeArchived(e.target.checked); }}
              />
              {t('common.includeArchived')}
            </label>
          ) : null}
        </div>

        {list.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> {t('loading')}
          </div>
        ) : list.error ? (
          <p role="alert" className="text-sm text-red-700">{errorMessage(list.error, t)}</p>
        ) : list.data && list.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('common.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data?.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-900">{c.name}</span>
                    {c.active ? null : <StatusBadge tone="muted">{t('common.archived')}</StatusBadge>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.phone ?? '—'}
                    {c.notes ? <> · {c.notes}</> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit(c) && c.active ? (
                    <Button variant="secondary" onClick={() => startEdit(c)}>{t('common.edit')}</Button>
                  ) : null}
                  {isOwner && c.active ? (
                    <Button variant="ghost" onClick={() => setArchiveTarget(c)}>{t('common.archive')}</Button>
                  ) : null}
                  {isOwner && !c.active ? (
                    <Button
                      variant="secondary"
                      onClick={() => restore.mutate(c.id)}
                      loading={restore.isPending && restore.variables === c.id}
                    >
                      {t('common.restore')}
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
      </section>

      <ConfirmDialog
        open={!!archiveTarget}
        title={t('customers.archiveConfirm.title')}
        body={t('customers.archiveConfirm.body', { name: archiveTarget?.name })}
        confirmLabel={t('common.archive')}
        loading={archive.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          await archive.mutateAsync(archiveTarget.id);
          setArchiveTarget(null);
        }}
      />
    </div>
  );
}
