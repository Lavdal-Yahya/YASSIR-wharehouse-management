import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import type { Tx } from '../inventory/tx';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customer.dto';

export type CustomerOut = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Customer is deliberately global (not shop-scoped) — the same person can buy
// in both shops (spec §18.4). No stored debt (D-009). No unique phone —
// families share numbers; duplicate avoidance is via the search box.
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListCustomersQueryDto): Promise<Paginated<CustomerOut>> {
    const where: Prisma.CustomerWhereInput = {};
    if (!q.includeArchived) where.active = true;
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return toPaginated(items, total, q.page, q.pageSize);
  }

  async findOne(id: string): Promise<CustomerOut> {
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('Customer', id);
    return found;
  }

  create(dto: CreateCustomerDto): Promise<CustomerOut> {
    return this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerOut> {
    await this.ensureExists(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone === undefined ? undefined : dto.phone,
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
    });
  }

  async archive(id: string): Promise<CustomerOut> {
    await this.ensureExists(id);
    return this.prisma.customer.update({ where: { id }, data: { active: false } });
  }

  async restore(id: string): Promise<CustomerOut> {
    await this.ensureExists(id);
    return this.prisma.customer.update({ where: { id }, data: { active: true } });
  }

  // Derived debt (P5-03, D-009). Never stored on Customer — the source
  // of truth is the sum of amountDue across the customer's active sales.
  // Callers may pass an existing tx (payment allocation in Phase 6 will
  // read this inside its own transaction); default is a fresh client
  // read for the customer list/detail pages.
  async outstanding(customerId: string, tx?: Tx): Promise<number> {
    const client = tx ?? this.prisma;
    const agg = await client.sale.aggregate({
      where: { customerId, status: SaleStatus.ACTIVE },
      _sum: { amountDue: true },
    });
    return agg._sum.amountDue ?? 0;
  }

  // Account summary for the customer account page (P6-01). Single
  // aggregate over active sales — no pagination needed because these
  // are true totals, not a list.
  async summary(id: string): Promise<{
    totalPurchases: number;
    totalPaid: number;
    outstanding: number;
  }> {
    const [customer, agg] = await this.prisma.$transaction([
      this.prisma.customer.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.sale.aggregate({
        where: { customerId: id, status: SaleStatus.ACTIVE },
        _sum: { totalAmount: true, amountPaid: true, amountDue: true },
      }),
    ]);
    if (!customer) throw new ResourceNotFoundError('Customer', id);
    return {
      totalPurchases: agg._sum.totalAmount ?? 0,
      totalPaid: agg._sum.amountPaid ?? 0,
      outstanding: agg._sum.amountDue ?? 0,
    };
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('Customer', id);
  }
}
