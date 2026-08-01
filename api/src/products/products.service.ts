import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UniqueConflictError, ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import type { SessionUser } from '../common/types/session-user';
import { processImage } from '../common/uploads/image-processor';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductHasHistoryError } from './errors';

// Return shape — snake-cases removed, category name projected for list rows so
// the frontend doesn't need a second join. Prices stay Int MRU (D-004).
export type ProductOut = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  description: string | null;
  imageUrl: string | null;
  defaultPurchaseCost: number | null;
  defaultSalePrice: number | null;
  lowStockThreshold: number | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const withCategory = { category: { select: { id: true, name: true } } } as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Central "does this product have anything referencing it" check.
  // Extended per each phase that adds a history table (schema-review §7):
  // P3 → order/receipt items, movements, corrections; P4 → transfer items;
  // P5 → sale items. Each phase adds its own count in the same PR that
  // introduces the table. One round-trip: six parallel counts.
  async hasHistory(productId: string): Promise<boolean> {
    const [orderItems, receiptItems, movements, corrections, transferItems, saleItems] =
      await Promise.all([
        this.prisma.incomingOrderItem.count({ where: { productId } }),
        this.prisma.stockReceiptItem.count({ where: { productId } }),
        this.prisma.inventoryMovement.count({ where: { productId } }),
        this.prisma.stockCorrection.count({ where: { productId } }),
        this.prisma.stockTransferItem.count({ where: { productId } }),
        this.prisma.saleItem.count({ where: { productId } }),
      ]);
    return orderItems + receiptItems + movements + corrections + transferItems + saleItems > 0;
  }

  async list(q: ListProductsQueryDto): Promise<Paginated<ProductOut>> {
    const where: Prisma.ProductWhereInput = {};
    if (!q.includeArchived) where.active = true;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { barcode: { contains: s, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: withCategory,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return toPaginated(rows.map(mapRow), total, q.page, q.pageSize);
  }

  async findOne(id: string): Promise<ProductOut> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: withCategory,
    });
    if (!row) throw new ResourceNotFoundError('Product', id);
    return mapRow(row);
  }

  async create(dto: CreateProductDto): Promise<ProductOut> {
    await this.ensureCategoryActive(dto.categoryId);
    try {
      const row = await this.prisma.product.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          sku: dto.sku ?? null,
          barcode: dto.barcode ?? null,
          description: dto.description ?? null,
          defaultPurchaseCost: dto.defaultPurchaseCost ?? null,
          defaultSalePrice: dto.defaultSalePrice ?? null,
          lowStockThreshold: dto.lowStockThreshold ?? null,
        },
        include: withCategory,
      });
      return mapRow(row);
    } catch (err) {
      const field = uniqueField(err);
      if (field) throw new UniqueConflictError('Product', field);
      throw err;
    }
  }

  async update(id: string, dto: UpdateProductDto, user?: SessionUser): Promise<ProductOut> {
    await this.ensureExists(id);
    if (dto.categoryId) await this.ensureCategoryActive(dto.categoryId);
    // SHOP users may not touch the purchase cost — it's the warehouse's WAC.
    // Drop it silently so a stale form value doesn't 400 the request.
    const purchaseCost =
      user?.role === Role.SHOP
        ? undefined
        : dto.defaultPurchaseCost === undefined
          ? undefined
          : dto.defaultPurchaseCost;
    try {
      const row = await this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          sku: dto.sku === undefined ? undefined : dto.sku,
          barcode: dto.barcode === undefined ? undefined : dto.barcode,
          description: dto.description === undefined ? undefined : dto.description,
          defaultPurchaseCost: purchaseCost,
          defaultSalePrice: dto.defaultSalePrice === undefined ? undefined : dto.defaultSalePrice,
          lowStockThreshold:
            dto.lowStockThreshold === undefined ? undefined : dto.lowStockThreshold,
        },
        include: withCategory,
      });
      return mapRow(row);
    } catch (err) {
      const field = uniqueField(err);
      if (field) throw new UniqueConflictError('Product', field);
      throw err;
    }
  }

  async archive(id: string): Promise<ProductOut> {
    await this.ensureExists(id);
    const row = await this.prisma.product.update({
      where: { id },
      data: { active: false, archivedAt: new Date() },
      include: withCategory,
    });
    return mapRow(row);
  }

  async restore(id: string): Promise<ProductOut> {
    await this.ensureExists(id);
    const row = await this.prisma.product.update({
      where: { id },
      data: { active: true, archivedAt: null },
      include: withCategory,
    });
    return mapRow(row);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    if (await this.hasHistory(id)) throw new ProductHasHistoryError();
    await this.prisma.product.delete({ where: { id } });
  }

  async setImage(
    id: string,
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ): Promise<ProductOut> {
    await this.ensureExists(id);
    const imageUrl = await processImage(file, 'products');
    const row = await this.prisma.product.update({
      where: { id },
      data: { imageUrl },
      include: withCategory,
    });
    return mapRow(row);
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.product.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('Product', id);
  }

  private async ensureCategoryActive(id: string): Promise<void> {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat || !cat.active) throw new ResourceNotFoundError('Category', id);
  }
}

function mapRow(row: Prisma.ProductGetPayload<{ include: typeof withCategory }>): ProductOut {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    description: row.description,
    imageUrl: row.imageUrl,
    defaultPurchaseCost: row.defaultPurchaseCost,
    defaultSalePrice: row.defaultSalePrice,
    lowStockThreshold: row.lowStockThreshold,
    active: row.active,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function uniqueField(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (err.code !== 'P2002') return null;
  const target = (err.meta as { target?: string[] } | undefined)?.target;
  if (!Array.isArray(target)) return 'name';
  if (target.includes('sku')) return 'sku';
  if (target.includes('barcode')) return 'barcode';
  return target[0] ?? 'name';
}
