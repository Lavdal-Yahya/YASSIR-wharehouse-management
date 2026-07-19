import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/Spinner';
import { useMe } from './api';

// Blocks the whole authed route tree until GET /auth/me resolves.
// Splash on pending; redirect to /login when the response says unauthenticated.
export function RequireAuth() {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-slate-500">
        <Spinner />
        <span>{t('loading')}</span>
      </div>
    );
  }
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
