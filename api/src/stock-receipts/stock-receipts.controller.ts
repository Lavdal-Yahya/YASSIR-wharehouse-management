import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import {
  CreateDirectReceiptDto,
  ListStockReceiptsQueryDto,
} from './dto/stock-receipt.dto';
import { StockReceiptsService } from './stock-receipts.service';

@Controller('stock-receipts')
export class StockReceiptsController {
  constructor(private readonly svc: StockReceiptsService) {}

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get()
  list(@Query() q: ListStockReceiptsQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post('direct')
  createDirect(@Body() dto: CreateDirectReceiptDto, @CurrentUser() user: SessionUser) {
    return this.svc.createDirect(dto, user);
  }
}
