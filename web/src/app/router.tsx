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
import ShopStockPage from '@/features/inventory/pages/ShopStockPage';
import MovementsPage from '@/features/inventory/pages/MovementsPage';
import CorrectionsPage from '@/features/inventory/pages/CorrectionsPage';
import OpeningStockPage from '@/features/inventory/pages/OpeningStockPage';
import OrdersListPage from '@/features/orders/pages/OrdersListPage';
import OrderNewPage from '@/features/orders/pages/OrderNewPage';
import OrderDetailPage from '@/features/orders/pages/OrderDetailPage';
import OrderReceivePage from '@/features/orders/pages/OrderReceivePage';
import DirectReceiptPage from '@/features/stock-receipts/pages/DirectReceiptPage';
import ReceiptsListPage from '@/features/stock-receipts/pages/ReceiptsListPage';
import ReceiptDetailPage from '@/features/stock-receipts/pages/ReceiptDetailPage';
import TransferNewPage from '@/features/transfers/pages/TransferNewPage';
import TransfersListPage from '@/features/transfers/pages/TransfersListPage';
import TransferDetailPage from '@/features/transfers/pages/TransferDetailPage';
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
            <Route path="settings/opening-stock" element={<OpeningStockPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="shops" element={<ShopsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="expense-categories" element={<ExpenseCategoriesPage />} />
          </Route>

          <Route element={<RequireRole allowed={[Role.OWNER, Role.WAREHOUSE]} />}>
            <Route path="warehouse" element={<WarehouseStockPage />} />
            <Route path="warehouse/movements" element={<MovementsPage />} />
            <Route path="warehouse/corrections" element={<CorrectionsPage />} />
            <Route path="warehouse/receipts" element={<ReceiptsListPage />} />
            <Route path="warehouse/receipts/direct" element={<DirectReceiptPage />} />
            <Route path="warehouse/receipts/:id" element={<ReceiptDetailPage />} />
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="orders/new" element={<OrderNewPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="orders/:id/receive" element={<OrderReceivePage />} />
            <Route path="products" element={<ProductsListPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<ProductFormPage />} />
            <Route path="transfers" element={<TransfersListPage />} />
            <Route path="transfers/new" element={<TransferNewPage />} />
            <Route path="transfers/:id" element={<TransferDetailPage />} />
          </Route>

          <Route element={<RequireRole allowed={[Role.OWNER, Role.SHOP]} />}>
            <Route path="shop" element={<ShopPage />} />
            <Route path="shop/stock" element={<ShopStockPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
