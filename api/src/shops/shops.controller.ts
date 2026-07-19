import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import { CreateShopDto, ListShopsQueryDto, UpdateShopDto } from './dto/shop.dto';
import { ShopsService } from './shops.service';

@Controller('shops')
export class ShopsController {
  constructor(private readonly svc: ShopsService) {}

  @Roles(Role.OWNER)
  @Get()
  list(@Query() q: ListShopsQueryDto) {
    return this.svc.list(q);
  }

  // Slim endpoint for the SHOP role — returns exactly their own shop.
  @Roles(Role.OWNER, Role.SHOP)
  @Get('mine')
  mine(@CurrentUser() user: SessionUser) {
    // OWNER hitting /mine is unusual but harmless if we scope by assignedShopId;
    // for OWNER without an assigned shop we reject rather than pick arbitrarily.
    if (!user.assignedShopId) {
      throw new ForbiddenException('No shop assigned');
    }
    return this.svc.findMine(user.assignedShopId);
  }

  @Roles(Role.OWNER)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Role.OWNER)
  @Post()
  create(@Body() dto: CreateShopDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShopDto) {
    return this.svc.update(id, dto);
  }

  @Roles(Role.OWNER)
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string) {
    return this.svc.archive(id);
  }

  @Roles(Role.OWNER)
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id') id: string) {
    return this.svc.restore(id);
  }

  @Roles(Role.OWNER)
  @Get(':id/stock-summary')
  stockSummary(@Param('id') id: string) {
    return this.svc.getStockSummary(id);
  }
}
