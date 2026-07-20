import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import {
  CancelIncomingOrderDto,
  CreateIncomingOrderDto,
  ListIncomingOrdersQueryDto,
  ReceiveIncomingOrderDto,
  UpdateIncomingOrderDto,
} from './dto/incoming-order.dto';
import { IncomingOrdersService } from './incoming-orders.service';
import { ReceiveService } from './receive.service';

// Warehouse workflow endpoints. WAREHOUSE role has full access per spec §6.2;
// OWNER always. SHOP never — the shop-scope guard's WAREHOUSE-related routes
// simply don't include SHOP in their @Roles list.

@Controller('incoming-orders')
export class IncomingOrdersController {
  constructor(
    private readonly svc: IncomingOrdersService,
    private readonly receiveSvc: ReceiveService,
  ) {}

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get()
  list(@Query() q: ListIncomingOrdersQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post()
  create(@Body() dto: CreateIncomingOrderDto, @CurrentUser() user: SessionUser) {
    return this.svc.create(dto, user);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIncomingOrderDto) {
    return this.svc.update(id, dto);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveIncomingOrderDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.receiveSvc.receive(id, dto, user);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelIncomingOrderDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.svc.cancel(id, dto, user);
  }
}
