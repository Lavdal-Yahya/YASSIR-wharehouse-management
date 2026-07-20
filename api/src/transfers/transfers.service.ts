import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import { ReferenceService } from '../inventory/reference.service';
import {
  CreateTransferDto,
  ListTransfersQueryDto,
} from './dto/transfer.dto';
import {
  DuplicateTransferItemError,
  LocationArchivedError,
  TransferNoItemsError,
  TransferSameLocationError,
} from './errors';

// TransfersService — creates and lists stock transfers (P4-02/P4-06).
// Reversal lives in TransferReversalService (P4-04) to keep this file's one
// transaction path readable.
//
// Design invariants:
//   - source ≠ destination (service-level check + DB CHECK backstop).
//   - Products must be active; balances are ONLY changed through the inventory
//     chokepoint (D-008); multi-item ⇒ single batch applyMovements call to
//     lock every affected (location, product) pair in one sorted pass (D-011).
//   - Transfers have no draft state — the row exists once completed.
//   - All-or-nothing: any item failing rolls back the whole transfer.

export type TransferItemOut = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type TransferOut = {
  id: string;
  referenceNumber: string;
  sourceLocationId: string;
  sourceLocationName: string;
  destinationLocationId: string;
  destinationLocationName: string;
  status: TransferStatus;
  transferDate: Date;
  notes: string | null;
  createdBy: string;
  reversedBy: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  itemCount: number;
  totalQuantity: number;
};

export type TransferDetail = TransferOut & {
  items: TransferItemOut[];
};

const withLocations = {
  sourceLocation: { select: { name: true } },
  destinationLocation: { select: { name: true } },
} as const;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refs: ReferenceService,
  ) {}

  async create(dto: CreateTransferDto, user: SessionUser): Promise<TransferDetail> {
    // Cheap up-front checks before opening a transaction. The DB CHECK
    // (transfer_distinct_locations) is the backstop; failing here gives a
    // clean 400 instead of a raw constraint violation.
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new TransferSameLocationError();
    }
    if (dto.items.length === 0) throw new TransferNoItemsError();

    // Reject duplicate productIds rather than silently merging — the UI
    // shouldn't be able to submit them, and if it does the user meant to
    // review the payload (phase-4 §3).
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.productId)) {
        throw new DuplicateTransferItemError(item.productId);
      }
      seen.add(item.productId);
    }

    const transferId = await this.prisma.$transaction(async (tx) => {
      // Both locations must exist and be active. Do them together — one
      // round-trip.
      const productIds = dto.items.map((it) => it.productId);
      const [locations, products] = await Promise.all([
        tx.location.findMany({
          where: { id: { in: [dto.sourceLocationId, dto.destinationLocationId] } },
          select: { id: true, active: true },
        }),
        tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, active: true },
        }),
      ]);

      const locById = new Map(locations.map((l) => [l.id, l]));
      const src = locById.get(dto.sourceLocationId);
      const dst = locById.get(dto.destinationLocationId);
      if (!src) throw new ResourceNotFoundError('Location', dto.sourceLocationId);
      if (!dst) throw new ResourceNotFoundError('Location', dto.destinationLocationId);
      if (!src.active) throw new LocationArchivedError(dto.sourceLocationId);
      if (!dst.active) throw new LocationArchivedError(dto.destinationLocationId);

      const productById = new Map(products.map((p) => [p.id, p]));
      for (const it of dto.items) {
        const p = productById.get(it.productId);
        if (!p) throw new ResourceNotFoundError('Product', it.productId);
        if (!p.active) {
          // Archived products cannot enter new transactions (phase-2 §2).
          throw new ResourceNotFoundError('Product', it.productId);
        }
      }

      const referenceNumber = await this.refs.next(tx, 'TRF');

      const transfer = await tx.stockTransfer.create({
        data: {
          referenceNumber,
          sourceLocationId: dto.sourceLocationId,
          destinationLocationId: dto.destinationLocationId,
          status: TransferStatus.COMPLETED,
          transferDate: new Date(dto.transferDate),
          notes: dto.notes ?? null,
          createdBy: user.id,
          items: {
            create: dto.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
            })),
          },
        },
        select: { id: true },
      });

      // Batch call: one TRANSFER movement per item, both sides set. The
      // chokepoint sorts pairs and locks them all in one pass — the crossed-
      // lock deadlock defense from D-011 is what makes concurrent
      // multi-item transfers safe.
      const movements: MovementInput[] = dto.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.TRANSFER,
        sourceLocationId: dto.sourceLocationId,
        destinationLocationId: dto.destinationLocationId,
        relatedEntityType: 'StockTransfer',
        relatedEntityId: transfer.id,
        createdBy: user.id,
      }));
      await this.inventory.applyMovements(tx, movements);

      return transfer.id;
    });

    return this.findOne(transferId);
  }

  async findOne(id: string): Promise<TransferDetail> {
    const row = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        ...withLocations,
        items: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!row) throw new ResourceNotFoundError('Transfer', id);
    const summary = summarize(row.items);
    return {
      ...mapRow(row, summary),
      items: row.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        quantity: it.quantity,
      })),
    };
  }

  async list(q: ListTransfersQueryDto): Promise<Paginated<TransferOut>> {
    const where: Prisma.StockTransferWhereInput = {};
    if (q.sourceLocationId) where.sourceLocationId = q.sourceLocationId;
    if (q.destinationLocationId)
      where.destinationLocationId = q.destinationLocationId;
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.transferDate = {};
      if (q.from) where.transferDate.gte = new Date(q.from);
      if (q.to) where.transferDate.lte = new Date(q.to);
    }
    if (q.search) {
      where.referenceNumber = { contains: q.search, mode: 'insensitive' };
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: {
          ...withLocations,
          items: { select: { quantity: true } },
        },
        orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const items = rows.map((r) => mapRow(r, summarize(r.items)));
    return toPaginated(items, total, q.page, q.pageSize);
  }
}

function summarize(items: Array<{ quantity: number }>): {
  itemCount: number;
  totalQuantity: number;
} {
  let totalQuantity = 0;
  for (const it of items) totalQuantity += it.quantity;
  return { itemCount: items.length, totalQuantity };
}

function mapRow(
  row: {
    id: string;
    referenceNumber: string;
    sourceLocationId: string;
    destinationLocationId: string;
    status: TransferStatus;
    transferDate: Date;
    notes: string | null;
    createdBy: string;
    reversedBy: string | null;
    reversedAt: Date | null;
    reversalReason: string | null;
    createdAt: Date;
    sourceLocation: { name: string };
    destinationLocation: { name: string };
  },
  summary: { itemCount: number; totalQuantity: number },
): TransferOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    sourceLocationId: row.sourceLocationId,
    sourceLocationName: row.sourceLocation.name,
    destinationLocationId: row.destinationLocationId,
    destinationLocationName: row.destinationLocation.name,
    status: row.status,
    transferDate: row.transferDate,
    notes: row.notes,
    createdBy: row.createdBy,
    reversedBy: row.reversedBy,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt,
    ...summary,
  };
}
