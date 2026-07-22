import { useEffect, useState } from 'react';
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
import { useShopsList } from '@/features/shops/api';
import { useMe } from '@/features/auth/api';
import {
  useCreateUser,
  useDisableUser,
  useEnableUser,
  useResetPassword,
  useUpdateUser,
  useUsersList,
} from '../api';
import type { User } from '../types';

const roleValues = [Role.OWNER, Role.WAREHOUSE, Role.SHOP] as const;

const baseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(200).optional(),
  role: z.enum(roleValues),
  assignedShopId: z.string().nullable().optional(),
});
type FormValues = z.infer<typeof baseSchema>;

const EMPTY: FormValues = {
  name: '',
  username: '',
  password: '',
  role: Role.SHOP,
  assignedShopId: null,
};

export default function UsersPage() {
  const { t } = useTranslation();
  const me = useMe();
  const currentUserId = me.data?.user.id;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [disableTarget, setDisableTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const list = useUsersList({ page, pageSize: 25, search, includeInactive });
  const shops = useShopsList({ page: 1, pageSize: 100 });
  const create = useCreateUser();
  const update = useUpdateUser(editing?.id ?? '');
  const disable = useDisableUser();
  const enable = useEnableUser();
  const reset = useResetPassword();

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: EMPTY,
  });
  const role = form.watch('role');

  useEffect(() => {
    if (role !== Role.SHOP) form.setValue('assignedShopId', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const startCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
  };
  const startEdit = (u: User) => {
    setEditing(u);
    form.reset({
      name: u.name,
      username: u.username,
      password: '',
      role: u.role,
      assignedShopId: u.assignedShopId,
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({
          name: values.name,
          role: values.role,
          assignedShopId: values.role === Role.SHOP ? values.assignedShopId ?? null : null,
        });
      } else {
        if (!values.password || values.password.length < 6) {
          form.setError('password', { message: 'min' });
          return;
        }
        await create.mutateAsync({
          name: values.name,
          username: values.username,
          password: values.password,
          role: values.role,
          assignedShopId: values.role === Role.SHOP ? values.assignedShopId ?? null : null,
        });
      }
      startCreate();
    } catch {
      /* surfaced */
    }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

      <section className="mb-6 rounded-lg border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink text-start">
          {editing ? t('users.form.editTitle') : t('users.form.createTitle')}
        </h2>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <Input
            label={t('users.form.name')}
            {...form.register('name')}
            error={form.formState.errors.name ? t('errors.BAD_REQUEST') : undefined}
          />
          <Input
            label={t('users.form.username')}
            disabled={!!editing}
            {...form.register('username')}
            error={form.formState.errors.username ? t('errors.BAD_REQUEST') : undefined}
          />

          {editing ? null : (
            <Input
              label={t('users.form.password')}
              type="password"
              {...form.register('password')}
              error={form.formState.errors.password ? t('users.form.passwordMin') : undefined}
            />
          )}

          <div className="flex flex-col gap-1 text-start">
            <label className="text-sm font-medium text-ink" htmlFor="u-role">
              {t('users.form.role')}
            </label>
            <select
              id="u-role"
              className="w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
              {...form.register('role')}
            >
              {roleValues.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          </div>

          {role === Role.SHOP ? (
            <div className="flex flex-col gap-1 text-start md:col-span-2">
              <label className="text-sm font-medium text-ink" htmlFor="u-shop">
                {t('users.form.assignedShop')}
              </label>
              <select
                id="u-shop"
                className="w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
                value={form.watch('assignedShopId') ?? ''}
                onChange={(e) => form.setValue('assignedShopId', e.target.value || null, { shouldDirty: true })}
              >
                <option value="">{t('users.form.chooseShop')}</option>
                {shops.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="md:col-span-2 flex justify-end gap-2">
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
            <p role="alert" className="md:col-span-2 rounded-md bg-debt-bg px-3 py-2 text-sm text-debt-fg">
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
              checked={includeInactive}
              onChange={(e) => { setPage(1); setIncludeInactive(e.target.checked); }}
            />
            {t('users.filter.includeInactive')}
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
            {list.data?.items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{u.name}</span>
                    <StatusBadge tone={u.active ? 'ok' : 'muted'}>
                      {t(`role.${u.role}`)}
                    </StatusBadge>
                    {u.active ? null : (
                      <StatusBadge tone="muted">{t('users.badge.disabled')}</StatusBadge>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    @{u.username}
                    {u.assignedShopName ? <> · {u.assignedShopName}</> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => startEdit(u)}>{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => setResetTarget(u)}>
                    {t('users.actions.resetPassword')}
                  </Button>
                  {u.active ? (
                    <Button
                      variant="ghost"
                      onClick={() => setDisableTarget(u)}
                      disabled={u.id === currentUserId}
                    >
                      {t('users.actions.disable')}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => enable.mutate(u.id)}
                      loading={enable.isPending && enable.variables === u.id}
                    >
                      {t('users.actions.enable')}
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
        open={!!disableTarget}
        danger
        title={t('users.disableConfirm.title')}
        body={
          disable.error
            ? errorMessage(disable.error, t)
            : t('users.disableConfirm.body', { name: disableTarget?.name })
        }
        confirmLabel={t('users.actions.disable')}
        loading={disable.isPending}
        onCancel={() => { setDisableTarget(null); disable.reset(); }}
        onConfirm={async () => {
          if (!disableTarget) return;
          try {
            await disable.mutateAsync(disableTarget.id);
            setDisableTarget(null);
          } catch {
            // Keep dialog open with the error shown.
          }
        }}
      />

      <ConfirmDialog
        open={!!resetTarget && generatedPassword === null}
        title={t('users.resetConfirm.title')}
        body={t('users.resetConfirm.body', { name: resetTarget?.name })}
        confirmLabel={t('users.actions.resetPassword')}
        loading={reset.isPending}
        onCancel={() => { setResetTarget(null); reset.reset(); }}
        onConfirm={async () => {
          if (!resetTarget) return;
          const out = await reset.mutateAsync(resetTarget.id);
          setGeneratedPassword(out.generatedPassword);
        }}
      />

      <ConfirmDialog
        open={generatedPassword !== null}
        title={t('users.resetResult.title')}
        body={
          <div>
            <p className="mb-2 text-sm text-ink">
              {t('users.resetResult.body', { name: resetTarget?.name })}
            </p>
            <code className="block rounded-md bg-tint px-3 py-2 text-base font-mono text-ink">
              {generatedPassword}
            </code>
            <p className="mt-2 text-xs text-muted">{t('users.resetResult.warning')}</p>
          </div>
        }
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        onCancel={() => {
          setGeneratedPassword(null);
          setResetTarget(null);
        }}
        onConfirm={() => {
          setGeneratedPassword(null);
          setResetTarget(null);
        }}
      />
    </div>
  );
}
