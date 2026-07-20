import { Route, Routes } from 'react-router-dom';
import { Role } from '@/shared/enums';
import LoginPage from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireRole } from '@/features/auth/RequireRole';
import { RoleRedirect } from '@/features/auth/RoleRedirect';
import { AuthedLayout } from './layouts/AuthedLayout';
import DashboardPage from '@/pages/DashboardPage';
import ShopPage from '@/pages/ShopPage';
import WarehouseStockPage from '@/features/inventory/pages/WarehouseStockPage';
import SettingsPage from '@/features/settings/pages/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import CategoriesPage from '@/features/categories/pages/CategoriesPage';
import ProductsListPage from '@/features/products/pages/ProductsListPage';
import ProductFormPage from '@/features/products/pages/ProductFormPage';
import ShopsPage from '@/features/shops/pages/ShopsPage';
import UsersPage from '@/features/users/pages/UsersPage';
import CustomersPage from '@/features/customers/pages/CustomersPage';
import ExpenseCategoriesPage from '@/features/expense-categories/pages/ExpenseCategoriesPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AuthedLayout />}>
          <Route index element={<RoleRedirect />} />

          {/* Customers — accessible to all authenticated roles (spec §31). */}
          <Route path="customers" element={<CustomersPage />} />

          <Route element={<RequireRole allowed={[Role.OWNER]} />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="shops" element={<ShopsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="expense-categories" element={<ExpenseCategoriesPage />} />
          </Route>

          <Route element={<RequireRole allowed={[Role.OWNER, Role.WAREHOUSE]} />}>
            <Route path="warehouse" element={<WarehouseStockPage />} />
            <Route path="products" element={<ProductsListPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<ProductFormPage />} />
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
