import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import { CreateOpeningStockDto } from './dto/opening-stock.dto';
import { OpeningStockService } from './opening-stock.service';

// Inventory HTTP surface. Reads and corrections join here in P3-09; movements
// list in P3-11's backend slice.

@Controller('inventory')
export class InventoryController {
  constructor(private readonly openingStock: OpeningStockService) {}

  @Roles(Role.OWNER)
  @Post('opening-stock')
  createOpeningStock(
    @Body() dto: CreateOpeningStockDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.openingStock.create(dto, user);
  }
}
