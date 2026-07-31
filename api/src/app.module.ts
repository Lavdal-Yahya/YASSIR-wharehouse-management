import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { ShopsModule } from './shops/shops.module';
import { CustomersModule } from './customers/customers.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { IncomingOrdersModule } from './incoming-orders/incoming-orders.module';
import { StockReceiptsModule } from './stock-receipts/stock-receipts.module';
import { LocationsModule } from './locations/locations.module';
import { TransfersModule } from './transfers/transfers.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { RemittancesModule } from './remittances/remittances.module';
import { ReportsModule } from './reports/reports.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionGuard } from './common/guards/session.guard';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Global rate-limit ceiling. Individual routes (login) override with
    // stricter @Throttle() settings.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    ShopsModule,
    UsersModule,
    CustomersModule,
    ExpenseCategoriesModule,
    SettingsModule,
    InventoryModule,
    IncomingOrdersModule,
    StockReceiptsModule,
    LocationsModule,
    TransfersModule,
    SalesModule,
    PaymentsModule,
    ExpensesModule,
    RemittancesModule,
    ReportsModule,
  ],
  providers: [
    // Order matters: throttle first, then auth, then role check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
