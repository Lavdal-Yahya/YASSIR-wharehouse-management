import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { SessionUser } from '../common/types/session-user';
import { InventoryService, MovementInput } from './inventory.service';
import { CreateOpeningStockDto } from './dto/opening-stock.dto';

// Opening stock (spec §13, P3-08): OWNER only. One OPENING_STOCK movement
// per item into the chosen location. Rule (phase-3 §3): reject if any
// (location, product) already has *any* movement — opening stock initializes,
// it never adjusts. Corrections do that.

export class OpeningStockAlreadyExistsError extends DomainError {
  readonly code = 'OPENING_STOCK_ALREADY_EXISTS';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly productIds: string[];
  constructor(productIds: string[]) {
    super(
      `Opening stock cannot be entered for products that already have movements: ${productIds.join(', ')}. ` +
        'Use a stock correction instead.',
    );
    this.productIds = productIds;
  }
}

@Injectable()
export class OpeningStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async create(dto: CreateOpeningStockDto, user: SessionUser): Promise<{
    locationId: string;
    itemCount: number;
    totalQuantity: number;
  }> {
    const nonZero = dto.items.filter((it) => it.quantity > 0);
    if (nonZero.length === 0) {
      throw new BadRequestException('At least one item with quantity > 0 is required');
    }

    await this.prisma.$transaction(async (tx) => {
      // Location must exist and be active.
      const loc = await tx.location.findUnique({
        where: { id: dto.locationId },
        select: { id: true, active: true },
      });
      if (!loc) throw new ResourceNotFoundError('Location', dto.locationId);
      if (!loc.active) throw new BadRequestException(`Location ${dto.locationId} is archived`);

      // Every product must exist and be active.
      const productIds = nonZero.map((it) => it.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, active: true },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      for (const it of nonZero) {
        const p = productById.get(it.productId);
        if (!p) throw new ResourceNotFoundError('Product', it.productId);
        if (!p.active) throw new BadRequestException(`Product ${it.productId} is archived`);
      }

      // Rule: opening stock is only ever the first movement for a
      // (location, product) pair. If any prior movement exists (in or out,
      // regardless of type), refuse — the caller should use a correction.
      const existing = await tx.inventoryMovement.findMany({
        where: {
          productId: { in: productIds },
          OR: [
            { destinationLocationId: dto.locationId },
            { sourceLocationId: dto.locationId },
          ],
        },
        select: { productId: true },
        distinct: ['productId'],
      });
      if (existing.length > 0) {
        throw new OpeningStockAlreadyExistsError(existing.map((e) => e.productId));
      }

      const movements: MovementInput[] = nonZero.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.OPENING_STOCK,
        destinationLocationId: dto.locationId,
        relatedEntityType: null,
        relatedEntityId: null,
        // Optional unitCost travels on the movement notes (opening stock has
        // no receipt row; unitCost is captured for the Phase-7 COGS pipeline).
        notes: buildNotes(it),
        createdBy: user.id,
      }));
      await this.inventory.applyMovements(tx, movements);
    });

    const totalQuantity = nonZero.reduce((sum, it) => sum + it.quantity, 0);
    return {
      locationId: dto.locationId,
      itemCount: nonZero.length,
      totalQuantity,
    };
  }
}

function buildNotes(it: { unitCost?: number; notes?: string | null }): string | null {
  const parts: string[] = [];
  if (typeof it.unitCost === 'number') parts.push(`unitCost=${it.unitCost}`);
  if (it.notes) parts.push(it.notes);
  return parts.length > 0 ? parts.join(' | ') : null;
}
