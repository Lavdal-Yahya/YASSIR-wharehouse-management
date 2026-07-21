import { Navigate } from 'react-router-dom';
import { Role } from '@/shared/enums';
import { useMe } from './api';

// Landing route inside AuthedLayout — sends each role to its home screen.
export function RoleRedirect() {
  const me = useMe();
  if (!me.data) return null;
  switch (me.data.user.role) {
    case Role.OWNER:
      return <Navigate to="/dashboard" replace />;
    case Role.WAREHOUSE:
      return <Navigate to="/warehouse" replace />;
    case Role.SHOP:
      return <Navigate to="/shop" replace />;
  }
}
