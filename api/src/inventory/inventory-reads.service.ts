import { Injectable } from '@nestjs/common';
import { LocationType, Prisma } from '@prisma/client';
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
  // For shop locations: the shop's ShopProductPrice.salePrice, or null if the
  // shop hasn't set one. For warehouse locations: always null — the warehouse
  // does not set retail prices.
  suggestedSalePrice: number | null;
  // Product.defaultPurchaseCost; drives stock-value math on the frontend.
  purchaseCost: number | null;
};

// Filter-scoped stock summary. Sums across every row that matches the caller's
// filters (search / category / stock-filter) — not just the current page.
export type StockSummaryOut = {
  totalUnits: number;
  totalValue: number;
  productsMissingCost: number;
};

export type BalancesResponse = Paginated<BalanceRowOut> & {
  summary: StockSummaryOut;
};

// Global stock value, split by location kind. Drives the owner dashboard
// card. SHOP users only see their own shop's number (server enforces).
export type StockValueBreakdown = {
  warehouseValue: number;
  shopsValue: number;
  totalValue: number;
  productsMissingCost: number;
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
  ): Promise<BalancesResponse> {
    const loc = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, type: true, shopId: true },
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
    // Two queries + summary: page slice, total count, and every matching
    // (productId, quantity, cost) tuple for the summary. lowStockOnly is
    // applied in-memory further down, so the summary here is the pre-filter
    // super-set — after slicing by low-stock we recompute if needed.
    const [rows, total, allForSummary] = await this.prisma.$transaction([
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
      this.prisma.inventoryBalance.findMany({
        where: balanceWhere,
        select: {
          productId: true,
          quantity: true,
          product: {
            select: {
              defaultPurchaseCost: true,
              lowStockThreshold: true,
            },
          },
        },
      }),
    ]);

    // Per-shop sale prices — one query keyed on the current shop. Warehouse
    // locations skip this entirely (they have no shop-level pricing).
    let shopPriceByProduct = new Map<string, number>();
    if (loc.type === LocationType.SHOP && loc.shopId) {
      const productIds = rows.map((r) => r.productId);
      if (productIds.length > 0) {
        const prices = await this.prisma.shopProductPrice.findMany({
          where: { shopId: loc.shopId, productId: { in: productIds } },
          select: { productId: true, salePrice: true },
        });
        shopPriceByProduct = new Map(prices.map((p) => [p.productId, p.salePrice]));
      }
    }

    let items = rows.map((r) =>
      mapBalance(r, defaultThreshold, shopPriceByProduct.get(r.productId) ?? null),
    );
    // lowStockOnly filters after mapping — the summary reflects the filter.
    if (q.lowStockOnly) {
      items = items.filter((r) => r.isLowStock);
    }

    const summary = buildSummary(allForSummary, defaultThreshold, q.lowStockOnly === true);
    // lowStockOnly is filtered client-side after the SQL count, so keep the
    // legacy pre-filter total here (the frontend paginator already lives with
    // this quirk); the summary uses the post-filter numbers instead.
    return {
      ...toPaginated(items, total, q.page, q.pageSize),
      summary,
    };
  }

  // Sums quantity × cost across all locations at once. Warehouse and shop
  // totals are separated so the dashboard can label them. Products without
  // a defaultPurchaseCost contribute zero and are counted so the UI can
  // flag the gap (spec §7 stock-value proxy).
  async getStockValueBreakdown(shopLocationIdFilter?: string): Promise<StockValueBreakdown> {
    // If a shop-scoped user is asking, restrict to that shop's location.
    // Warehouse total is zero in that case — that user has no window on it.
    const where: Prisma.InventoryBalanceWhereInput = {
      quantity: { gt: 0 },
    };
    if (shopLocationIdFilter) where.locationId = shopLocationIdFilter;

    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      select: {
        quantity: true,
        location: { select: { type: true } },
        product: { select: { defaultPurchaseCost: true } },
      },
    });

    let warehouseValue = 0;
    let shopsValue = 0;
    let productsMissingCost = 0;
    for (const r of rows) {
      const cost = r.product.defaultPurchaseCost;
      if (cost === null || cost === undefined) {
        productsMissingCost += 1;
        continue;
      }
      const line = r.quantity * cost;
      if (r.location.type === LocationType.WAREHOUSE) warehouseValue += line;
      else shopsValue += line;
    }
    return {
      warehouseValue,
      shopsValue,
      totalValue: warehouseValue + shopsValue,
      productsMissingCost,
    };
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
      defaultPurchaseCost: number | null;
      categoryId: string;
      category: { id: string; name: string };
    };
  },
  defaultThreshold: number,
  shopSalePrice: number | null,
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
    suggestedSalePrice: shopSalePrice,
    purchaseCost: row.product.defaultPurchaseCost,
  };
}

function buildSummary(
  rows: Array<{
    quantity: number;
    product: {
      defaultPurchaseCost: number | null;
      lowStockThreshold: number | null;
    };
  }>,
  defaultThreshold: number,
  lowStockOnly: boolean,
): StockSummaryOut {
  let totalUnits = 0;
  let totalValue = 0;
  let productsMissingCost = 0;
  for (const r of rows) {
    if (lowStockOnly) {
      const threshold = r.product.lowStockThreshold ?? defaultThreshold;
      const isOut = r.quantity === 0;
      const isLow = !isOut && r.quantity <= threshold;
      if (!isLow) continue;
    }
    totalUnits += r.quantity;
    const cost = r.product.defaultPurchaseCost;
    if (cost === null || cost === undefined) productsMissingCost += 1;
    else totalValue += r.quantity * cost;
  }
  return { totalUnits, totalValue, productsMissingCost };
}
