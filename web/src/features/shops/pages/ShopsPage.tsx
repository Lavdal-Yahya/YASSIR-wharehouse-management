import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/shared/api-client';
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
  useArchiveShop,
  useCreateShop,
  useRestoreShop,
  useShopStockSummary,
  useShopsList,
  useUpdateShop,
} from '../api';
import type { Shop } from '../types';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { name: '', address: null, phone: null };

export default function ShopsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Shop | null>(null);

  const list = useShopsList({ page, pageSize: 25, search, includeArchived });
  const create = useCreateShop();
  // The update hook is per-id; instantiate one at the top and change target id in state.
  const update = useUpdateShop(editing?.id ?? '');
  const archive = useArchiveShop();
  const restore = useRestoreShop();
  const stockSummary = useShopStockSummary(archiveTarget?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const startCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
  };
  const startEdit = (s: Shop) => {
    setEditing(s);
    form.reset({ name: s.name, address: s.address, phone: s.phone });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      address: values.address ?? null,
      phone: values.phone ?? null,
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

  const archiveErrorUsers =
    archive.error instanceof ApiError && archive.error.code === 'SHOP_HAS_ACTIVE_USERS'
      ? t('shops.archiveError.body')
      : null;

  return (
    <div>
      <PageHeader title={t('shops.title')} subtitle={t('shops.subtitle')} />

      <section className="mb-6 rounded-lg border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink text-start">
          {editing ? t('shops.form.editTitle') : t('shops.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Input
            label={t('shops.form.name')}
            {...form.register('name')}
            error={form.formState.errors.name ? t('errors.BAD_REQUEST') : undefined}
          />
          <Input
            label={<>{t('shops.form.address')} <span className="text-xs text-muted">({t('common.optional')})</span></>}
            {...form.register('address', { setValueAs: (v) => (v === '' ? null : v) })}
          />
          <Input
            label={<>{t('shops.form.phone')} <span className="text-xs text-muted">({t('common.optional')})</span></>}
            {...form.register('phone', { setValueAs: (v) => (v === '' ? null : v) })}
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
            <p role="alert" className="md:col-span-3 rounded-md bg-debt-bg px-3 py-2 text-sm text-debt-fg">
              {errorMessage(mutationError, t)}
            </p>
          ) : null}
        </form>
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
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
            {list.data?.items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink">{s.name}</span>
                    {s.active ? null : <StatusBadge tone="muted">{t('common.archived')}</StatusBadge>}
                  </div>
                  <div className="text-xs text-muted">
                    {s.address ?? '—'}{s.phone ? <> · {s.phone}</> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.active ? (
                    <>
                      <Button variant="secondary" onClick={() => startEdit(s)}>{t('common.edit')}</Button>
                      <Button variant="ghost" onClick={() => setArchiveTarget(s)}>{t('common.archive')}</Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => restore.mutate(s.id)}
                      loading={restore.isPending && restore.variables === s.id}
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
        title={t('shops.archiveConfirm.title')}
        body={
          archiveErrorUsers ?? (
            <>
              <p>{t('shops.archiveConfirm.body', { name: archiveTarget?.name })}</p>
              {stockSummary.data && stockSummary.data.productCount > 0 ? (
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800">
                  {t('shops.archiveConfirm.stockWarning', {
                    products: stockSummary.data.productCount,
                    units: stockSummary.data.totalUnits,
                  })}
                </p>
              ) : null}
            </>
          )
        }
        confirmLabel={t('common.archive')}
        loading={archive.isPending}
        onCancel={() => {
          setArchiveTarget(null);
          archive.reset();
        }}
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive.mutateAsync(archiveTarget.id);
            setArchiveTarget(null);
          } catch {
            // Keep the dialog open so the error is visible.
          }
        }}
      />
    </div>
  );
}
