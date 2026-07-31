import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  CancelRemittanceDto,
  CreateRemittanceDto,
  ListRemittancesQueryDto,
} from './dto/remittance.dto';
import { RemittancesService } from './remittances.service';

// Cash remittance routes. SHOP body.shopId is silently rewritten to the
// SHOP user's assignedShopId by ShopScopeGuard. Cancel is OWNER-only —
// reversing a cash drop must be an ownership decision, not a shop-side
// undo. WAREHOUSE gets read-only visibility on the receiving side.

@Controller('remittances')
@UseGuards(ShopScopeGuard)
export class RemittancesController {
  constructor(private readonly svc: RemittancesService) {}

  @Roles(Role.OWNER, Role.SHOP, Role.WAREHOUSE)
  @Get()
  list(@Query() q: ListRemittancesQueryDto, @CurrentUser() user: SessionUser) {
    return this.svc.list(q, user);
  }

  @Roles(Role.OWNER, Role.SHOP, Role.WAREHOUSE)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.svc.findOne(id, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Post()
  create(@Body() dto: CreateRemittanceDto, @CurrentUser() user: SessionUser) {
    return this.svc.create(dto, user);
  }

  @Roles(Role.OWNER)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRemittanceDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.svc.cancel(id, dto, user);
  }
}
