import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  // Read is universal — pickers on every product/sale form use it.
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get()
  list(@Query() q: ListCategoriesQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
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
}
