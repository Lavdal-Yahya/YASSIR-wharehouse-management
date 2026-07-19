import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError, UniqueConflictError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import {
  CreateExpenseCategoryDto,
  ListExpenseCategoriesQueryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';

// Shape mirrors Category; the two are separate namespaces because a shared
// list would confuse product-tree and expense-report queries.
type ExpenseCategoryOut = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
};

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListExpenseCategoriesQueryDto): Promise<Paginated<ExpenseCategoryOut>> {
    const where: Prisma.ExpenseCategoryWhereInput = {};
    if (!q.includeArchived) where.active = true;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expenseCategory.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.expenseCategory.count({ where }),
    ]);
    return toPaginated(items, total, q.page, q.pageSize);
  }

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryOut> {
    try {
      return await this.prisma.expenseCategory.create({ data: { name: dto.name } });
    } catch (err) {
      if (isUnique(err)) throw new UniqueConflictError('ExpenseCategory', 'name');
      throw err;
    }
  }

  async update(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategoryOut> {
    await this.ensureExists(id);
    try {
      return await this.prisma.expenseCategory.update({
        where: { id },
        data: { name: dto.name },
      });
    } catch (err) {
      if (isUnique(err)) throw new UniqueConflictError('ExpenseCategory', 'name');
      throw err;
    }
  }

  async archive(id: string): Promise<ExpenseCategoryOut> {
    await this.ensureExists(id);
    return this.prisma.expenseCategory.update({ where: { id }, data: { active: false } });
  }

  async restore(id: string): Promise<ExpenseCategoryOut> {
    await this.ensureExists(id);
    return this.prisma.expenseCategory.update({ where: { id }, data: { active: true } });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('ExpenseCategory', id);
  }
}

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
