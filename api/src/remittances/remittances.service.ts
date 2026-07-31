import { Injectable } from '@nestjs/common';
import { Prisma, RemittanceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { ReferenceService } from '../inventory/reference.service';
import { computeShopCashOnHand } from '../reports/common/money-quantities';
import {
  CancelRemittanceDto,
  CreateRemittanceDto,
  ListRemittancesQueryDto,
} from './dto/remittance.dto';
import {
  RemittanceExceedsCashOnHandError,
  RemittanceNotCancellableError,
  RemittanceNotFoundError,
} from './errors';

// Cash remittance = shop → warehouse cash drop. Creating one debits
// the shop's derived cash-on-hand and credits the warehouse's. No
// persistent cash balance row — the balance is computed on every read
// through computeShopCashOnHand / computeWarehouseCash.
//
// Shop scoping: SHOP body.shopId is substituted by ShopScopeGuard.
// findOne / cancel refuse cross-shop access with 404 (spec §29.3
// pattern used elsewhere). Cancel is OWNER-only per product decision:
// shop staff must not silently unwind their own cash drops.

export type RemittanceOut = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  amount: number;
  remittanceDate: Date;
  notes: string | null;
  status: RemittanceStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class RemittancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceService,
  ) {}

  async create(
    dto: CreateRemittanceDto,
    user: SessionUser,
  ): Promise<RemittanceOut> {
    // Cash-on-hand check happens OUTSIDE the transaction: another
    // sale/payment could race in and inflate it, but that only makes the
    // remittance safer to accept (we're being conservative). The only
    // race that could burn us is two concurrent remittances totalling
    // more than the balance — vanishingly rare for a manual daily
    // operation. If that shows up in practice, wrap in a serializable
    // transaction.
    const shop = await this.prisma.shop.findUnique({
      where: { id: dto.shopId },
      select: { id: true, active: true },
    });
    if (!shop) throw new ResourceNotFoundError('Shop', dto.shopId);
    if (!shop.active) throw new ResourceNotFoundError('Shop', dto.shopId);

    const available = await computeShopCashOnHand(this.prisma, dto.shopId);
    if (dto.amount > available) {
      throw new RemittanceExceedsCashOnHandError(dto.amount, available);
    }

    return this.prisma.$transaction(async (tx) => {
      const referenceNumber = await this.refs.next(tx, 'RMT');
      const created = await tx.cashRemittance.create({
        data: {
          referenceNumber,
          shopId: dto.shopId,
          amount: dto.amount,
          remittanceDate: dto.remittanceDate
            ? new Date(dto.remittanceDate)
            : new Date(),
          notes: dto.notes ?? null,
          status: RemittanceStatus.ACTIVE,
          createdBy: user.id,
        },
        include: remittanceInclude,
      });
      return mapRemittance(created);
    });
  }

  async cancel(
    id: string,
    dto: CancelRemittanceDto,
    user: SessionUser,
  ): Promise<RemittanceOut> {
    const existing = await this.loadForWrite(id, user);
    if (existing.status !== RemittanceStatus.ACTIVE) {
      throw new RemittanceNotCancellableError(existing.status);
    }
    const updated = await this.prisma.cashRemittance.update({
      where: { id },
      data: {
        status: RemittanceStatus.CANCELLED,
        cancelledBy: user.id,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: remittanceInclude,
    });
    return mapRemittance(updated);
  }

  async findOne(id: string, user: SessionUser): Promise<RemittanceOut> {
    const row = await this.prisma.cashRemittance.findUnique({
      where: { id },
      include: remittanceInclude,
    });
    if (!row) throw new RemittanceNotFoundError(id);
    if (user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new RemittanceNotFoundError(id);
    }
    return mapRemittance(row);
  }

  async list(
    q: ListRemittancesQueryDto,
    user: SessionUser,
  ): Promise<Paginated<RemittanceOut>> {
    const where: Prisma.CashRemittanceWhereInput = {};
    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) throw new ResourceNotFoundError('Shop', 'own');
      where.shopId = user.assignedShopId;
    } else if (q.shopId) {
      where.shopId = q.shopId;
    }
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.remittanceDate = {};
      if (q.from) where.remittanceDate.gte = new Date(q.from);
      if (q.to) where.remittanceDate.lte = new Date(q.to);
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cashRemittance.findMany({
        where,
        include: remittanceInclude,
        orderBy: [{ remittanceDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.cashRemittance.count({ where }),
    ]);
    return toPaginated(rows.map(mapRemittance), total, q.page, q.pageSize);
  }

  // WAREHOUSE role reads only — they can see all remittances (that's
  // the money arriving at their location). Kept simple: no cross-shop
  // hiding for WAREHOUSE.
  private async loadForWrite(
    id: string,
    user: SessionUser,
  ): Promise<{ id: string; shopId: string; status: RemittanceStatus }> {
    const row = await this.prisma.cashRemittance.findUnique({
      where: { id },
      select: { id: true, shopId: true, status: true },
    });
    if (!row) throw new RemittanceNotFoundError(id);
    if (user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new RemittanceNotFoundError(id);
    }
    return row;
  }
}

const remittanceInclude = {
  shop: { select: { name: true } },
} as const;

type RemittanceRow = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shop: { name: string };
  amount: number;
  remittanceDate: Date;
  notes: string | null;
  status: RemittanceStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRemittance(row: RemittanceRow): RemittanceOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    shopId: row.shopId,
    shopName: row.shop.name,
    amount: row.amount,
    remittanceDate: row.remittanceDate,
    notes: row.notes,
    status: row.status,
    createdBy: row.createdBy,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
