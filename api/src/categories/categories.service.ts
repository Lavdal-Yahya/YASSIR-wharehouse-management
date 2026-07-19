import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UniqueConflictError, ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto/category.dto';

type CategoryOut = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListCategoriesQueryDto): Promise<Paginated<CategoryOut>> {
    const where: Prisma.CategoryWhereInput = {};
    if (!q.includeArchived) where.active = true;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.category.count({ where }),
    ]);
    return toPaginated(items, total, q.page, q.pageSize);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryOut> {
    try {
      return await this.prisma.category.create({ data: { name: dto.name } });
    } catch (err) {
      if (isPrismaUniqueError(err, 'name')) {
        throw new UniqueConflictError('Category', 'name');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryOut> {
    await this.ensureExists(id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name: dto.name },
      });
    } catch (err) {
      if (isPrismaUniqueError(err, 'name')) {
        throw new UniqueConflictError('Category', 'name');
      }
      throw err;
    }
  }

  async archive(id: string): Promise<CategoryOut> {
    await this.ensureExists(id);
    return this.prisma.category.update({
      where: { id },
      data: { active: false },
    });
  }

  async restore(id: string): Promise<CategoryOut> {
    await this.ensureExists(id);
    return this.prisma.category.update({
      where: { id },
      data: { active: true },
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.category.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('Category', id);
  }
}

function isPrismaUniqueError(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = (err.meta as { target?: string[] } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : true;
}
