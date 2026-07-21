import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { DebtReportService } from './debt-report.service';
import { SalesReportService } from './sales-report.service';
import { ShopReportService } from './shop-report.service';
import { WarehouseReportService } from './warehouse-report.service';

// ReportsModule aggregates read-only projections over the money and
// stock model (phase-7 §4). Every report goes through the shared
// `common/` primitives — active-only filters (D-013 for allocations),
// resolveReportScope (shop-scoping + UTC date bounds per D-015), and
// the four money-quantity functions (sales value, cash collected,
// new debt, outstanding) so no report re-derives them.
//
// Providers grow as each report service lands (P7-05..09).

@Module({
  controllers: [ReportsController],
  providers: [
    ShopReportService,
    WarehouseReportService,
    SalesReportService,
    DebtReportService,
  ],
  exports: [
    ShopReportService,
    WarehouseReportService,
    SalesReportService,
    DebtReportService,
  ],
})
export class ReportsModule {}
