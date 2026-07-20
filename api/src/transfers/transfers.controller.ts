import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import {
  CreateTransferDto,
  ListTransfersQueryDto,
  ReverseTransferDto,
} from './dto/transfer.dto';
import { TransferReversalService } from './transfer-reversal.service';
import { TransfersService } from './transfers.service';

// Transfers routes. Shop employees never appear on any of these — creating
// transfers is a WAREHOUSE/OWNER concern (D-014, phase-4 §4). Shop stock is
// visible through the /inventory/:locationId route scoped by ShopScopeGuard.

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly svc: TransfersService,
    private readonly reversal: TransferReversalService,
  ) {}

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get()
  list(@Query() q: ListTransfersQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post()
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: SessionUser) {
    return this.svc.create(dto, user);
  }

  // OWNER only — an audit-level operation (spec §16.5). WAREHOUSE creates
  // transfers; only OWNER unwinds them.
  @Roles(Role.OWNER)
  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseTransferDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reversal.reverse(id, dto, user);
  }
}
