import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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

  // Warehouse-role users see the warehouse via this route; SHOP users
  // silently get their own shop's location no matter what locationId
  // they pass — the ShopScopeGuard contract, applied at the controller
  // because the id here is a locationId, not a shopId. A SHOP user
  // without an assigned shop is a data inconsistency (users service
  // guarantees it) — 403 if we ever land in that state.
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':locationId')
  async listBalances(
    @Param('locationId') locationId: string,
    @Query() q: ListBalancesQueryDto,
    @CurrentUser() user: SessionUser,
  ) {
    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) {
        throw new ForbiddenException('Shop user has no assigned shop');
      }
      const own = await this.prisma.location.findFirst({
        where: { shopId: user.assignedShopId },
        select: { id: true },
      });
      if (!own) throw new NotFoundException('Assigned shop has no location');
      locationId = own.id;
    }
    return this.reads.listBalances(locationId, q);
  }
}
