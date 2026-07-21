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
  ListPaymentsQueryDto,
  RegisterPaymentDto,
  ReversePaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

// Customer-payment routes (phase-6 §6). WAREHOUSE never appears —
// receiving cash is shop business (spec §29.3). SHOP users have their
// shopId substituted in the body by ShopScopeGuard on register; list
// and detail defensively re-constrain in the service.

@Controller('payments')
@UseGuards(ShopScopeGuard)
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Roles(Role.OWNER, Role.SHOP)
  @Get()
  list(@Query() q: ListPaymentsQueryDto, @CurrentUser() user: SessionUser) {
    return this.svc.list(q, user);
  }

  // findOne passes the user so a SHOP client asking for a foreign
  // payment id gets a clean 404 (no existence leak, spec §29.3).
  @Roles(Role.OWNER, Role.SHOP)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.svc.findOne(id, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Post()
  register(@Body() dto: RegisterPaymentDto, @CurrentUser() user: SessionUser) {
    return this.svc.register(dto, user);
  }

  // OWNER only. Reversal is an audit-level operation and never available
  // to shop employees (spec §25 / phase-6 §4).
  @Roles(Role.OWNER)
  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  reverse(
    @Param('id') id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.svc.reverse(id, dto, user);
  }
}
