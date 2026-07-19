import { Outlet } from 'react-router-dom';
import { useMe } from './api';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import type { Role } from '@/shared/enums';

// UX-only role gate. The API is the real enforcement; this just prevents
// dead-end navigation to routes the user's role can't do anything with.
export function RequireRole({ allowed }: { allowed: readonly Role[] }) {
  const me = useMe();
  if (!me.data) return null;
  if (!allowed.includes(me.data.user.role)) return <ForbiddenPage />;
  return <Outlet />;
}
