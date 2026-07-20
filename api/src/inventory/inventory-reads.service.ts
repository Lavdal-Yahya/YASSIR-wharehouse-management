import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import {
  ListBalancesQueryDto,
  ListMovementsQueryDto,
} from './dto/correction.dto';

// Read-only projections over the inventory tables. The warehouse stock page,
// shop inventory page, and movement history all live on top of these.
// Low/out-of-stock flags are computed server-side (phase-3 §3): the client
// never derives them.

export type BalanceRowOut = {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  quantity: number;
  lowStockThreshold: number | null;
  effectiveThreshold: number; // product's threshold OR settings default OR 0
  isLowStock: boolean;
  isOutOfStock: boolean;
  suggestedSalePrice: number | null;
};

export type MovementRowOut = {
  id: string;
  productId: string;
  productName: string;
  movementType: string;
  quantity: number;
  sourceLocationId: string | null;
  sourceLocationName: string | null;
  destinationLocationId: string | null;
  destinationLocationName: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedEntityReference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
};

const DEFAULT_LOW_STOCK_KEY = 'defaultLowStockThreshold';

@Injectable()
export class InventoryReadsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(
    locationId: string,
    q: ListBalancesQueryDto,
  ): Promise<Paginated<BalanceRowOut>> {
    const loc = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!loc) throw new ResourceNotFoundError('Location', locationId);

    // Default threshold from app settings; parseInt guards against admins
    // saving 'abc' — falls back to 0 rather than NaN.
    const settingRow = await this.prisma.appSetting.findUnique({
      where: { key: DEFAULT_LOW_STOCK_KEY },
    });
    const defaultThreshold = settingRow ? parseInt(settingRow.value, 10) || 0 : 0;

    // Build WHERE on the product side; balance side just filters by location.
    // includeZero=false by default so an out-of-stock product with no
    // balance row doesn't clutter the list; outOfStockOnly overrides that.
    const productWhere: Prisma.ProductWhereInput = { active: true };
    if (q.categoryId) productWhere.categoryId = q.categoryId;
    if (q.search) {
      productWhere.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
        { barcode: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    // If outOfStockOnly, we need to include products that have NO balance row
    // for this location as well (they are trivially at zero). For simplicity
    // in v1 we operate over InventoryBalance rows only, meaning "out of stock"
    // reads "row exists with quantity = 0". A never-received product doesn't
    // appear yet — surface it only once it's been transferred/opened.
    const balanceWhere: Prisma.InventoryBalanceWhereInput = {
      locationId,
      product: productWhere,
    };
    if (q.outOfStockOnly) {
      balanceWhere.quantity = 0;
    } else if (!q.includeZero) {
      balanceWhere.quantity = { gt: 0 };
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryBalance.findMany({
        where: balanceWhere,
        include: {
          product: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ product: { name: 'asc' } }],
        skip,
        take,
      }),
      this.prisma.inventoryBalance.count({ where: balanceWhere }),
    ]);

    let items = rows.map((r) => mapBalance(r, defaultThreshold));
    if (q.lowStockOnly) items = items.filter((r) => r.isLowStock);
    return toPaginated(items, total, q.page, q.pageSize);
  }

  async listMovements(
    q: ListMovementsQueryDto,
  ): Promise<Paginated<MovementRowOut>> {
    const where: Prisma.InventoryMovementWhereInput = {};
    if (q.productId) where.productId = q.productId;
    if (q.movementType) where.movementType = q.movementType;
    if (q.locationId) {
      where.OR = [
        { sourceLocationId: q.locationId },
        { destinationLocationId: q.locationId },
      ];
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { name: true } },
          sourceLocation: { select: { name: true } },
          destinationLocation: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    // Cheap secondary lookup: attach the emitter's reference number
    // (StockReceipt.REC-*, StockCorrection.ADJ-*, etc.). Skipped if the
    // related entity is missing — this is display sugar, not correctness.
    const items = await Promise.all(rows.map((r) => this.projectMovement(r)));
    return toPaginated(items, total, q.page, q.pageSize);
  }

  private async projectMovement(row: {
    id: string;
    productId: string;
    movementType: string;
    quantity: number;
    sourceLocationId: string | null;
    destinationLocationId: string | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    notes: string | null;
    createdBy: string;
    createdAt: Date;
    product: { name: string };
    sourceLocation: { name: string } | null;
    destinationLocation: { name: string } | null;
  }): Promise<MovementRowOut> {
    let relatedEntityReference: string | null = null;
    if (row.relatedEntityType && row.relatedEntityId) {
      relatedEntityReference = await this.lookupRelatedRef(
        row.relatedEntityType,
        row.relatedEntityId,
      );
    }
    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      movementType: row.movementType,
      quantity: row.quantity,
      sourceLocationId: row.sourceLocationId,
      sourceLocationName: row.sourceLocation?.name ?? null,
      destinationLocationId: row.destinationLocationId,
      destinationLocationName: row.destinationLocation?.name ?? null,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      relatedEntityReference,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  private async lookupRelatedRef(type: string, id: string): Promise<string | null> {
    // Only the three emitters that exist in Phase 3; later phases (Transfer,
    // Sale) extend this switch when their own movements start writing here.
    switch (type) {
      case 'StockReceipt': {
        const r = await this.prisma.stockReceipt.findUnique({
          where: { id },
          select: { referenceNumber: true },
        });
        return r?.referenceNumber ?? null;
      }
      case 'StockCorrection': {
        const r = await this.prisma.stockCorrection.findUnique({
          where: { id },
          select: { referenceNumber: true },
        });
        return r?.referenceNumber ?? null;
      }
      default:
        return null;
    }
  }
}

function mapBalance(
  row: {
    productId: string;
    quantity: number;
    product: {
      name: string;
      sku: string | null;
      barcode: string | null;
      imageUrl: string | null;
      lowStockThreshold: number | null;
      defaultSalePrice: number | null;
      categoryId: string;
      category: { id: string; name: string };
    };
  },
  defaultThreshold: number,
): BalanceRowOut {
  const effectiveThreshold = row.product.lowStockThreshold ?? defaultThreshold;
  const isOutOfStock = row.quantity === 0;
  const isLowStock = !isOutOfStock && row.quantity <= effectiveThreshold;
  return {
    productId: row.productId,
    productName: row.product.name,
    categoryId: row.product.categoryId,
    categoryName: row.product.category.name,
    sku: row.product.sku,
    barcode: row.product.barcode,
    imageUrl: row.product.imageUrl,
    quantity: row.quantity,
    lowStockThreshold: row.product.lowStockThreshold,
    effectiveThreshold,
    isLowStock,
    isOutOfStock,
    suggestedSalePrice: row.product.defaultSalePrice,
  };
}
