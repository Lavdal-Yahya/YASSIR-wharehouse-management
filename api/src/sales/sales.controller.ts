import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShopScopeGuard } from '../common/guards/shop-scope.guard';
import type { SessionUser } from '../common/types/session-user';
import { CreateSaleDto, ListSalesQueryDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

// Sales routes (phase-5 §4). WAREHOUSE never appears — sales are shop
// business (spec §29.3). SHOP posts land in the SHOP user's own shop
// regardless of any client-supplied shopId (ShopScopeGuard rewrites
// body.shopId and query.shopId in place; the service defensively
// re-constrains list queries too).

@Controller('sales')
@UseGuards(ShopScopeGuard)
export class SalesController {
  constructor(private readonly svc: SalesService) {}

  @Roles(Role.OWNER, Role.SHOP)
  @Get()
  list(@Query() q: ListSalesQueryDto, @CurrentUser() user: SessionUser) {
    return this.svc.list(q, user);
  }

  // findOne passes the user so a SHOP client asking for a foreign sale
  // id gets a clean 404 instead of leaking existence via 403.
  @Roles(Role.OWNER, Role.SHOP)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.svc.findOne(id, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: SessionUser) {
    return this.svc.confirm(dto, user);
  }
}
