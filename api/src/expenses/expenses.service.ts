import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { ReferenceService } from '../inventory/reference.service';
import {
  CancelExpenseDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import {
  ExpenseNotCancellableError,
  ExpenseNotEditableError,
  ExpenseNotFoundError,
} from './errors';

// ExpensesService — the one write path in Phase 7 (spec §26). The rest
// of the phase is aggregation. Cancellation-not-deletion applies:
//   * A cancelled expense keeps its row and is excluded from active
//     totals by the report layer filtering status = ACTIVE.
//   * Editing an already-cancelled expense is refused — the record is
//     frozen for the audit trail. Reopen via a fresh expense in the
//     correct shop/category.
//
// Shop scoping is enforced at three levels:
//   1. ShopScopeGuard rewrites body.shopId for SHOP users.
//   2. list() defensively re-constrains query.shopId to
//      user.assignedShopId.
//   3. findOne / update / cancel refuse cross-shop access with 404
//      (not 403) — no existence leak, matching sales/payments.

export type ExpenseOut = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  expenseDate: Date;
  description: string;
  notes: string | null;
  status: ExpenseStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceService,
  ) {}

  async create(dto: CreateExpenseDto, user: SessionUser): Promise<ExpenseOut> {
    return this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: dto.shopId },
        select: { id: true, active: true },
      });
      if (!shop) throw new ResourceNotFoundError('Shop', dto.shopId);
      if (!shop.active) throw new ResourceNotFoundError('Shop', dto.shopId);

      if (dto.categoryId) {
        const cat = await tx.expenseCategory.findUnique({
          where: { id: dto.categoryId },
          select: { id: true, active: true },
        });
        if (!cat) {
          throw new ResourceNotFoundError('ExpenseCategory', dto.categoryId);
        }
        // Archived categories still let historical expenses reference them
        // through their FK, but they must not enter new expenses (matches
        // the phase-2 archive rule).
        if (!cat.active) {
          throw new ResourceNotFoundError('ExpenseCategory', dto.categoryId);
        }
      }

      const referenceNumber = await this.refs.next(tx, 'EXP');
      const created = await tx.expense.create({
        data: {
          referenceNumber,
          shopId: dto.shopId,
          categoryId: dto.categoryId ?? null,
          amount: dto.amount,
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
          description: dto.description,
          notes: dto.notes ?? null,
          status: ExpenseStatus.ACTIVE,
          createdBy: user.id,
        },
        include: expenseInclude,
      });
      return mapExpense(created);
    });
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    user: SessionUser,
  ): Promise<ExpenseOut> {
    const existing = await this.loadForWrite(id, user);
    if (existing.status !== ExpenseStatus.ACTIVE) {
      throw new ExpenseNotEditableError(existing.status);
    }

    // categoryId null == explicit clear (allowed); missing == unchanged.
    if (dto.categoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, active: true },
      });
      if (!cat) {
        throw new ResourceNotFoundError('ExpenseCategory', dto.categoryId);
      }
      if (!cat.active) {
        throw new ResourceNotFoundError('ExpenseCategory', dto.categoryId);
      }
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        amount: dto.amount,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        description: dto.description,
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
      include: expenseInclude,
    });
    return mapExpense(updated);
  }

  async cancel(
    id: string,
    dto: CancelExpenseDto,
    user: SessionUser,
  ): Promise<ExpenseOut> {
    const existing = await this.loadForWrite(id, user);
    if (existing.status !== ExpenseStatus.ACTIVE) {
      throw new ExpenseNotCancellableError(existing.status);
    }
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.CANCELLED,
        cancelledBy: user.id,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: expenseInclude,
    });
    return mapExpense(updated);
  }

  async findOne(id: string, user: SessionUser): Promise<ExpenseOut> {
    const row = await this.prisma.expense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    // Cross-shop lookup from a SHOP user gets 404, not 403 — no
    // existence leak (spec §29.3, same policy as sales/payments).
    if (!row) throw new ExpenseNotFoundError(id);
    if (user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new ExpenseNotFoundError(id);
    }
    return mapExpense(row);
  }

  async list(
    q: ListExpensesQueryDto,
    user: SessionUser,
  ): Promise<Paginated<ExpenseOut>> {
    const where: Prisma.ExpenseWhereInput = {};
    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) throw new ResourceNotFoundError('Shop', 'own');
      where.shopId = user.assignedShopId;
    } else if (q.shopId) {
      where.shopId = q.shopId;
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.expenseDate = {};
      if (q.from) where.expenseDate.gte = new Date(q.from);
      if (q.to) where.expenseDate.lte = new Date(q.to);
    }
    if (q.search) {
      where.OR = [
        { referenceNumber: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return toPaginated(rows.map(mapExpense), total, q.page, q.pageSize);
  }

  // Shared write-precondition: the row exists AND the caller has the
  // shop-scope to touch it. Same 404-for-foreign policy as findOne so
  // update/cancel can't be used to probe expense existence.
  private async loadForWrite(
    id: string,
    user: SessionUser,
  ): Promise<{ id: string; shopId: string; status: ExpenseStatus }> {
    const row = await this.prisma.expense.findUnique({
      where: { id },
      select: { id: true, shopId: true, status: true },
    });
    if (!row) throw new ExpenseNotFoundError(id);
    if (user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new ExpenseNotFoundError(id);
    }
    return row;
  }
}

const expenseInclude = {
  shop: { select: { name: true } },
  category: { select: { name: true } },
} as const;

type ExpenseRow = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shop: { name: string };
  categoryId: string | null;
  category: { name: string } | null;
  amount: number;
  expenseDate: Date;
  description: string;
  notes: string | null;
  status: ExpenseStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapExpense(row: ExpenseRow): ExpenseOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    shopId: row.shopId,
    shopName: row.shop.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    amount: row.amount,
    expenseDate: row.expenseDate,
    description: row.description,
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
