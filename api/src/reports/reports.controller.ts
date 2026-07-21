import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShopScopeGuard } from '../common/guards/shop-scope.guard';
import type { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { DebtReportService } from './debt-report.service';
import { IncomingOrdersReportService } from './incoming-orders-report.service';
import { SalesReportService } from './sales-report.service';
import { ShopReportService } from './shop-report.service';
import { WarehouseReportService } from './warehouse-report.service';

// Reports routes (phase-7 §5). Every report shares the ReportFilterDto
// shape { shopId?, from?, to? }; the services enforce shop-scoping and
// active-only via the common/ primitives. New report endpoints get
// added here one at a time (P7-05..09).
//
// SHOP users have shopId rewritten by ShopScopeGuard on the way in,
// and resolveReportScope re-enforces it in the service — belt AND
// suspenders, because report responses expose aggregate money figures
// and a scope leak here would be worse than a route leak.

@Controller('reports')
@UseGuards(ShopScopeGuard)
export class ReportsController {
  constructor(
    private readonly shopReport: ShopReportService,
    private readonly warehouseReport: WarehouseReportService,
    private readonly salesReport: SalesReportService,
    private readonly debtReport: DebtReportService,
    private readonly incomingOrdersReport: IncomingOrdersReportService,
  ) {}

  // Shop report — the marquee. WAREHOUSE never sees shop money
  // (spec §29.3); their reports are the warehouse-side one below.
  @Roles(Role.OWNER, Role.SHOP)
  @Get('shop')
  shop(@Query() filter: ReportFilterDto, @CurrentUser() user: SessionUser) {
    return this.shopReport.build(filter, user);
  }

  // Warehouse report — inventory-side, no money. WAREHOUSE + OWNER
  // only; SHOP has their own /inventory/:locationId page for shop stock.
  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get('warehouse')
  warehouse(@Query() filter: ReportFilterDto, @CurrentUser() user: SessionUser) {
    return this.warehouseReport.build(filter, user);
  }

  // Sales breakdowns — by status, shop, product (top-N), UTC day.
  // Shop-scoped for SHOP users; OWNER may aggregate across shops.
  @Roles(Role.OWNER, Role.SHOP)
  @Get('sales')
  sales(@Query() filter: ReportFilterDto, @CurrentUser() user: SessionUser) {
    return this.salesReport.build(filter, user);
  }

  // Debt view — outstanding by customer / by shop + payments in window.
  @Roles(Role.OWNER, Role.SHOP)
  @Get('debt')
  debt(@Query() filter: ReportFilterDto, @CurrentUser() user: SessionUser) {
    return this.debtReport.build(filter, user);
  }

  // Incoming orders — warehouse-side, no shop scoping.
  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get('incoming-orders')
  incomingOrders(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.incomingOrdersReport.build(filter, user);
  }
}
