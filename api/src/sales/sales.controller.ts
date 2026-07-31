import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShopScopeGuard } from '../common/guards/shop-scope.guard';
import type { SessionUser } from '../common/types/session-user';
import {
  CancelSaleDto,
  CreateSaleDto,
  ListSalesQueryDto,
  UpdateSaleDto,
} from './dto/sale.dto';
import { SaleCancellationService } from './sale-cancellation.service';
import { SaleEditService } from './sale-edit.service';
import { SalesService } from './sales.service';

// Sales routes (phase-5 §4). WAREHOUSE never appears — sales are shop
// business (spec §29.3). SHOP posts land in the SHOP user's own shop
// regardless of any client-supplied shopId (ShopScopeGuard rewrites
// body.shopId and query.shopId in place; the service defensively
// re-constrains list queries too).

@Controller('sales')
@UseGuards(ShopScopeGuard)
export class SalesController {
  constructor(
    private readonly svc: SalesService,
    private readonly cancellation: SaleCancellationService,
    private readonly edits: SaleEditService,
  ) {}

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

  // OWNER only — book correction (P6-13). Rewrites item qty/price
  // and header notes/date without emitting stock movements. Cancelled
  // sales are frozen; sales with more cash allocated than the new
  // total return SALE_EDIT_WOULD_ORPHAN_PAYMENT so the owner reverses
  // payments first.
  @Roles(Role.OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.edits.edit(id, dto);
  }

  // OWNER only — cancellation is an audit-level operation (spec §24.2).
  // The service refuses when any active payment allocation points at the
  // sale (SALE_HAS_ACTIVE_PAYMENTS with the blocking references) so the
  // owner reverses those first, then cancels.
  @Roles(Role.OWNER)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.cancellation.cancel(id, dto, user);
  }
}
