import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import {
  CreateStockCorrectionDto,
  ListBalancesQueryDto,
  ListMovementsQueryDto,
  ListStockCorrectionsQueryDto,
} from './dto/correction.dto';
import { CreateOpeningStockDto } from './dto/opening-stock.dto';
import { CorrectionsService } from './corrections.service';
import { InventoryReadsService } from './inventory-reads.service';
import { OpeningStockService } from './opening-stock.service';

// Inventory HTTP surface. Note the route ordering: static paths
// (opening-stock, corrections, movements) come BEFORE :locationId so
// Nest doesn't route /inventory/corrections to the balances endpoint.

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly openingStock: OpeningStockService,
    private readonly corrections: CorrectionsService,
    private readonly reads: InventoryReadsService,
  ) {}

  @Roles(Role.OWNER)
  @Post('opening-stock')
  createOpeningStock(
    @Body() dto: CreateOpeningStockDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.openingStock.create(dto, user);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post('corrections')
  createCorrection(
    @Body() dto: CreateStockCorrectionDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.corrections.create(dto, user);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get('corrections')
  listCorrections(@Query() q: ListStockCorrectionsQueryDto) {
    return this.corrections.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get('movements')
  listMovements(@Query() q: ListMovementsQueryDto) {
    return this.reads.listMovements(q);
  }

  // Warehouse-role users see the warehouse via this route; SHOP users hit it
  // with their own shopId once P4 wires the ShopScopeGuard for shop pages.
  // Both cases are enforced at the service layer via Location lookups.
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':locationId')
  listBalances(
    @Param('locationId') locationId: string,
    @Query() q: ListBalancesQueryDto,
  ) {
    return this.reads.listBalances(locationId, q);
  }
}
