import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ApiError } from '@/shared/api-client';
import { useSettings } from '@/features/settings/api';
import { useLogin, useMe } from '../api';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

const KNOWN_ERROR_CODES = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_USER_DISABLED',
  'TOO_MANY_REQUESTS',
  'BAD_REQUEST',
]);

export default function LoginPage() {
  const { t } = useTranslation();
  const me = useMe();
  const login = useLogin();
  const settings = useSettings();
  const businessName = settings.data?.businessName?.trim() || t('app.name');
  const logoUrl = settings.data?.logoUrl || null;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  if (me.data) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit((values) => {
    login.mutate(values);
  });

  const errorCode =
    login.error instanceof ApiError
      ? KNOWN_ERROR_CODES.has(login.error.code)
        ? login.error.code
        : 'INTERNAL'
      : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : null}
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{businessName}</h1>
              <p className="text-sm text-slate-500">{t('login.subtitle')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            label={t('login.username')}
            autoComplete="username"
            autoFocus
            {...register('username')}
            error={errors.username ? t('errors.BAD_REQUEST') : undefined}
          />
          <Input
            label={t('login.password')}
            type="password"
            autoComplete="current-password"
            {...register('password')}
            error={errors.password ? t('errors.BAD_REQUEST') : undefined}
          />
          {errorCode ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(`errors.${errorCode}`)}
            </p>
          ) : null}
          <Button type="submit" loading={login.isPending} className="w-full">
            {login.isPending ? t('login.loading') : t('login.submit')}
          </Button>
        </form>
      </div>
    </main>
  );
}
