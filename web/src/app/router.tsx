import { Route, Routes } from 'react-router-dom';
import { Role } from '@/shared/enums';
import LoginPage from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireRole } from '@/features/auth/RequireRole';
import { RoleRedirect } from '@/features/auth/RoleRedirect';
import { AuthedLayout } from './layouts/AuthedLayout';
import DashboardPage from '@/pages/DashboardPage';
import WarehousePage from '@/pages/WarehousePage';
import ShopPage from '@/pages/ShopPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AuthedLayout />}>
          <Route index element={<RoleRedirect />} />

          <Route element={<RequireRole allowed={[Role.OWNER]} />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route element={<RequireRole allowed={[Role.OWNER, Role.WAREHOUSE]} />}>
            <Route path="warehouse" element={<WarehousePage />} />
          </Route>

          <Route element={<RequireRole allowed={[Role.OWNER, Role.SHOP]} />}>
            <Route path="shop" element={<ShopPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
