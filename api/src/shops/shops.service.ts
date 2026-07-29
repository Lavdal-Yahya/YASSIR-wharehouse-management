import { Injectable } from '@nestjs/common';
import { LocationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { CreateShopDto, ListShopsQueryDto, UpdateShopDto } from './dto/shop.dto';
import { ShopHasActiveUsersError } from './errors';

// Shop + Location move together — the Location row is created and renamed
// inside the same transaction as the Shop (phase-2.md §3, P2-07). Nothing in
// the codebase should construct a Location for a shop except this service.

export type ShopOut = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  locationId: string | null;
};

// Live from Phase 3. Backs the archive-time "shop still holds stock" warning
// (spec §15.4). productCount = distinct products with any positive balance;
// totalUnits = sum of all positive balances at the shop's location.
// totalValue sums qty × Product.defaultPurchaseCost across positive balances;
// products with a null cost contribute 0 and are reported separately so the
// UI can flag the gap.
export type ShopStockSummary = {
  productCount: number;
  totalUnits: number;
  totalValue: number;
  productsMissingCost: number;
};

export type ShopPriceRow = {
  productId: string;
  salePrice: number;
  updatedAt: Date;
};

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListShopsQueryDto): Promise<Paginated<ShopOut>> {
    const where: Prisma.ShopWhereInput = {};
    if (!q.includeArchived) where.active = true;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shop.findMany({
        where,
        include: { location: { select: { id: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.shop.count({ where }),
    ]);
    return toPaginated(rows.map(mapRow), total, q.page, q.pageSize);
  }

  async findMine(shopId: string): Promise<ShopOut> {
    const row = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { location: { select: { id: true } } },
    });
    if (!row) throw new ResourceNotFoundError('Shop', shopId);
    return mapRow(row);
  }

  async findOne(id: string): Promise<ShopOut> {
    return this.findMine(id);
  }

  // Shop + Location in one transaction (P2-07). Location.name mirrors the
  // shop name so the warehouse-side pickers can display it directly.
  async create(dto: CreateShopDto): Promise<ShopOut> {
    const row = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: dto.name,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
        },
      });
      await tx.location.create({
        data: { name: shop.name, type: LocationType.SHOP, shopId: shop.id, active: true },
      });
      return tx.shop.findUniqueOrThrow({
        where: { id: shop.id },
        include: { location: { select: { id: true } } },
      });
    });
    return mapRow(row);
  }

  async update(id: string, dto: UpdateShopDto): Promise<ShopOut> {
    await this.ensureExists(id);
    const row = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.update({
        where: { id },
        data: {
          name: dto.name,
          address: dto.address === undefined ? undefined : dto.address,
          phone: dto.phone === undefined ? undefined : dto.phone,
        },
      });
      if (dto.name !== undefined) {
        // Rename the paired location in the same transaction (phase-2.md §3).
        await tx.location.updateMany({
          where: { shopId: shop.id },
          data: { name: shop.name },
        });
      }
      return tx.shop.findUniqueOrThrow({
        where: { id: shop.id },
        include: { location: { select: { id: true } } },
      });
    });
    return mapRow(row);
  }

  async archive(id: string): Promise<ShopOut> {
    await this.ensureExists(id);
    const activeUsers = await this.prisma.user.findMany({
      where: { assignedShopId: id, active: true },
      select: { id: true, name: true, username: true },
    });
    if (activeUsers.length > 0) {
      throw new ShopHasActiveUsersError(activeUsers.map((u) => u.id));
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.update({
        where: { id },
        data: { active: false, archivedAt: new Date() },
      });
      // The paired location follows the shop's active state.
      await tx.location.updateMany({ where: { shopId: id }, data: { active: false } });
      return tx.shop.findUniqueOrThrow({
        where: { id: shop.id },
        include: { location: { select: { id: true } } },
      });
    });
    return mapRow(row);
  }

  async restore(id: string): Promise<ShopOut> {
    await this.ensureExists(id);
    const row = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.update({
        where: { id },
        data: { active: true, archivedAt: null },
      });
      await tx.location.updateMany({ where: { shopId: id }, data: { active: true } });
      return tx.shop.findUniqueOrThrow({
        where: { id: shop.id },
        include: { location: { select: { id: true } } },
      });
    });
    return mapRow(row);
  }

  // Real implementation from Phase 3. Aggregates positive balances at the
  // shop's Location. Zero-quantity rows are legitimate (product was here,
  // now empty) and don't count against archiving.
  async getStockSummary(shopId: string): Promise<ShopStockSummary> {
    await this.ensureExists(shopId);
    const location = await this.prisma.location.findUnique({
      where: { shopId },
      select: { id: true },
    });
    // A shop with no location row (shouldn't happen — P2-07 pairs them) has
    // no stock by definition.
    if (!location) {
      return { productCount: 0, totalUnits: 0, totalValue: 0, productsMissingCost: 0 };
    }
    const rows = await this.prisma.inventoryBalance.findMany({
      where: { locationId: location.id, quantity: { gt: 0 } },
      select: { quantity: true, product: { select: { defaultPurchaseCost: true } } },
    });
    let totalUnits = 0;
    let totalValue = 0;
    let productsMissingCost = 0;
    for (const r of rows) {
      totalUnits += r.quantity;
      const cost = r.product.defaultPurchaseCost;
      if (cost === null || cost === undefined) productsMissingCost += 1;
      else totalValue += r.quantity * cost;
    }
    return {
      productCount: rows.length,
      totalUnits,
      totalValue,
      productsMissingCost,
    };
  }

  // Per-shop price CRUD (feature: shops decide sale price). Callers must
  // ensure the acting user is authorized for this shop — the controller
  // gates OWNER and SHOP-scoped-to-self.
  async listPrices(shopId: string): Promise<ShopPriceRow[]> {
    await this.ensureExists(shopId);
    const rows = await this.prisma.shopProductPrice.findMany({
      where: { shopId },
      select: { productId: true, salePrice: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows;
  }

  async upsertPrice(
    shopId: string,
    productId: string,
    salePrice: number,
  ): Promise<ShopPriceRow> {
    await this.ensureExists(shopId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, active: true },
    });
    if (!product) throw new ResourceNotFoundError('Product', productId);
    const row = await this.prisma.shopProductPrice.upsert({
      where: { shopId_productId: { shopId, productId } },
      create: { shopId, productId, salePrice },
      update: { salePrice },
      select: { productId: true, salePrice: true, updatedAt: true },
    });
    return row;
  }

  async deletePrice(shopId: string, productId: string): Promise<void> {
    await this.ensureExists(shopId);
    await this.prisma.shopProductPrice.deleteMany({
      where: { shopId, productId },
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.shop.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('Shop', id);
  }
}

function mapRow(
  row: Prisma.ShopGetPayload<{ include: { location: { select: { id: true } } } }>,
): ShopOut {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    active: row.active,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    locationId: row.location?.id ?? null,
  };
}

