import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get()
  list(@Query() q: ListCustomersQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  // Shop employees create customers mid-sale (spec §18.4).
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.OWNER, Role.SHOP)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
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

  // Derived debt (P5-03, D-009). Exposed as its own tiny endpoint so
  // pages that only need the total don't have to pull the whole sale
  // list. Available to every authenticated role — the customer list is
  // shared and this is just a projection over sales they can see.
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':id/outstanding')
  async outstanding(@Param('id') id: string): Promise<{ outstanding: number }> {
    return { outstanding: await this.svc.outstanding(id) };
  }

  // Account totals for the customer account page (P6-01).
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':id/summary')
  summary(@Param('id') id: string) {
    return this.svc.summary(id);
  }
}
