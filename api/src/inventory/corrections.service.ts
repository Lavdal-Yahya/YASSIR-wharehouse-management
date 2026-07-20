import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { InventoryService } from './inventory.service';
import { ReferenceService } from './reference.service';
import {
  CreateStockCorrectionDto,
  ListStockCorrectionsQueryDto,
} from './dto/correction.dto';

// Stock corrections (P3-09, spec §28). ±quantity with mandatory reason.
// Sign convention (D-011): the human record on StockCorrection keeps the
// original signed adjustmentQuantity; the paired movement stores abs(qty)
// with the direction encoded by which side is set.

export type StockCorrectionOut = {
  id: string;
  referenceNumber: string;
  locationId: string;
  locationName: string;
  productId: string;
  productName: string;
  adjustmentQuantity: number;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
};

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refs: ReferenceService,
  ) {}

  async create(
    dto: CreateStockCorrectionDto,
    user: SessionUser,
  ): Promise<StockCorrectionOut> {
    // Zero already rejected by DTO; DTO also validates integer. Belt-and-braces.
    if (dto.adjustmentQuantity === 0 || !Number.isInteger(dto.adjustmentQuantity)) {
      throw new BadRequestException('adjustmentQuantity must be a non-zero integer');
    }

    const correctionId = await this.prisma.$transaction(async (tx) => {
      const [loc, product] = await Promise.all([
        tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true, active: true },
        }),
        tx.product.findUnique({
          where: { id: dto.productId },
          select: { id: true, active: true },
        }),
      ]);
      if (!loc) throw new ResourceNotFoundError('Location', dto.locationId);
      if (!loc.active) throw new BadRequestException(`Location ${dto.locationId} is archived`);
      if (!product) throw new ResourceNotFoundError('Product', dto.productId);
      if (!product.active) throw new BadRequestException(`Product ${dto.productId} is archived`);

      const ref = await this.refs.next(tx, 'ADJ');
      const correction = await tx.stockCorrection.create({
        data: {
          referenceNumber: ref,
          locationId: dto.locationId,
          productId: dto.productId,
          adjustmentQuantity: dto.adjustmentQuantity,
          reason: dto.reason,
          notes: dto.notes ?? null,
          createdBy: user.id,
        },
        select: { id: true },
      });

      // Movement: abs(qty); direction from sign. Negative corrections hit the
      // insufficient-stock guard naturally (chokepoint throws before the DB
      // CHECK constraint fires).
      const qty = Math.abs(dto.adjustmentQuantity);
      const isIncrease = dto.adjustmentQuantity > 0;
      await this.inventory.applyMovement(tx, {
        productId: dto.productId,
        quantity: qty,
        movementType: MovementType.STOCK_CORRECTION,
        sourceLocationId: isIncrease ? null : dto.locationId,
        destinationLocationId: isIncrease ? dto.locationId : null,
        relatedEntityType: 'StockCorrection',
        relatedEntityId: correction.id,
        notes: dto.reason,
        createdBy: user.id,
      });

      return correction.id;
    });

    return this.findOne(correctionId);
  }

  async findOne(id: string): Promise<StockCorrectionOut> {
    const row = await this.prisma.stockCorrection.findUnique({
      where: { id },
      include: {
        location: { select: { name: true } },
        product: { select: { name: true } },
      },
    });
    if (!row) throw new ResourceNotFoundError('StockCorrection', id);
    return mapRow(row);
  }

  async list(
    q: ListStockCorrectionsQueryDto,
  ): Promise<Paginated<StockCorrectionOut>> {
    const where: Prisma.StockCorrectionWhereInput = {};
    if (q.locationId) where.locationId = q.locationId;
    if (q.productId) where.productId = q.productId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search) {
      where.OR = [
        { referenceNumber: { contains: q.search, mode: 'insensitive' } },
        { reason: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockCorrection.findMany({
        where,
        include: {
          location: { select: { name: true } },
          product: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.stockCorrection.count({ where }),
    ]);
    return toPaginated(rows.map(mapRow), total, q.page, q.pageSize);
  }
}

function mapRow(row: {
  id: string;
  referenceNumber: string;
  locationId: string;
  productId: string;
  adjustmentQuantity: number;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  location: { name: string };
  product: { name: string };
}): StockCorrectionOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    locationId: row.locationId,
    locationName: row.location.name,
    productId: row.productId,
    productName: row.product.name,
    adjustmentQuantity: row.adjustmentQuantity,
    reason: row.reason,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}
