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

// Placeholder for Phase 3+. In Phase 2 there is no InventoryBalance table,
// so the summary is always empty. Kept so the frontend can already render the
// "still has stock" warning path even though the data is trivially empty.
export type ShopStockSummary = { totalItems: number };

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

  // Stub for phase 4+; empty in Phase 2. Wired now so the archive UI can query.
  getStockSummary(_shopId: string): Promise<ShopStockSummary> {
    void _shopId;
    return Promise.resolve({ totalItems: 0 });
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

