import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { SessionUser } from '../common/types/session-user';
import { MAX_IMAGE_BYTES } from '../common/uploads/image-processor';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get()
  list(@Query() q: ListProductsQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.svc.create(dto);
  }

  // SHOP users can edit product master data too, but the service strips
  // defaultPurchaseCost from their payload — that field is the warehouse's
  // number (WAC / cost baseline) and shops must not rewrite it.
  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: SessionUser) {
    return this.svc.update(id, dto, user);
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
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.svc.remove(id);
  }

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Post(':id/image')
  @UseInterceptors(
    // Memory storage — image-processor validates + re-encodes to disk. Limit
    // stops obviously oversized uploads at the parser layer; content-type
    // and magic bytes are checked in the service.
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  setImage(
    @Param('id') id: string,
    @UploadedFile()
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ) {
    return this.svc.setImage(id, file);
  }
}
