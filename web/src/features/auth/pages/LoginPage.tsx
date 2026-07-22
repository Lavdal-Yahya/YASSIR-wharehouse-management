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

// Login screen — the design brief opens on this. Big touch targets,
// indigo brand slab as the top half so first-time users see the
// app's personality before the form. Nothing else on the page.

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
    <main className="min-h-dvh bg-app">
      {/* Indigo band — reads as the brand's identity, no logo file
          required. LanguageSwitcher pinned to the top corner. */}
      <div className="relative bg-brand pb-24 pt-4">
        <div className="mx-auto flex max-w-md items-center justify-end px-4">
          <LanguageSwitcher variant="onBrand" />
        </div>
        <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 px-4 text-white">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-16 w-16 rounded-lg object-cover shadow-lg"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold text-white"
              aria-hidden
            >
              {businessName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="text-center text-[22px] font-bold leading-tight text-white">
            {businessName}
          </h1>
          <p className="text-center text-[14px] text-white/75">
            {t('login.subtitle')}
          </p>
        </div>
      </div>

      {/* Card floats over the band — visual anchor drawing the eye
          down to the form. */}
      <div className="mx-auto -mt-16 w-full max-w-md px-4 pb-10">
        <div className="rounded-[14px] border border-line bg-surface p-5 shadow-[0_12px_32px_rgba(24,25,40,0.08)]">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
              inputMode="numeric"
              {...register('password')}
              error={errors.password ? t('errors.BAD_REQUEST') : undefined}
            />
            {errorCode ? (
              <p
                role="alert"
                className="rounded-input bg-debt-bg px-3 py-2 text-[14px] font-medium text-debt-fg"
              >
                {t(`errors.${errorCode}`)}
              </p>
            ) : null}
            <Button
              type="submit"
              loading={login.isPending}
              className="w-full !h-14 !text-[16px]"
            >
              {login.isPending ? t('login.loading') : t('login.submit')}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
