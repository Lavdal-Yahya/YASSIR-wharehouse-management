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
  CancelExpenseDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

// Expenses routes (phase-7 §3). WAREHOUSE never appears — expenses are
// shop cash outflows (spec §26.1). SHOP body.shopId is silently
// substituted to the SHOP user's assignedShopId by ShopScopeGuard.

@Controller('expenses')
@UseGuards(ShopScopeGuard)
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Roles(Role.OWNER, Role.SHOP)
  @Get()
  list(@Query() q: ListExpensesQueryDto, @CurrentUser() user: SessionUser) {
    return this.svc.list(q, user);
  }

  // findOne / update / cancel each pass the user so a SHOP request for
  // a foreign expense id yields 404, not 403 (spec §29.3).
  @Roles(Role.OWNER, Role.SHOP)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.svc.findOne(id, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: SessionUser) {
    return this.svc.create(dto, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelExpenseDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.svc.cancel(id, dto, user);
  }
}
