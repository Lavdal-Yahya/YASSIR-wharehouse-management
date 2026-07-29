import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import { CreateShopDto, ListShopsQueryDto, UpdateShopDto } from './dto/shop.dto';
import { UpsertShopPriceDto } from './dto/shop-price.dto';
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

  @Roles(Role.OWNER, Role.SHOP)
  @Get(':id/stock-summary')
  stockSummary(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    this.assertShopScope(user, id);
    return this.svc.getStockSummary(id);
  }

  // Per-shop sale prices. SHOP users can only touch their own shop; OWNER
  // can touch any. WAREHOUSE has no read/write access — pricing is not
  // their concern.
  @Roles(Role.OWNER, Role.SHOP)
  @Get(':id/prices')
  listPrices(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    this.assertShopScope(user, id);
    return this.svc.listPrices(id);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Put(':id/prices/:productId')
  upsertPrice(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpsertShopPriceDto,
    @CurrentUser() user: SessionUser,
  ) {
    this.assertShopScope(user, id);
    return this.svc.upsertPrice(id, productId, dto.salePrice);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Delete(':id/prices/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrice(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @CurrentUser() user: SessionUser,
  ) {
    this.assertShopScope(user, id);
    await this.svc.deletePrice(id, productId);
  }

  private assertShopScope(user: SessionUser, shopId: string): void {
    if (user.role === Role.SHOP && user.assignedShopId !== shopId) {
      throw new ForbiddenException('Shop-scoped user cannot access another shop');
    }
  }
}
