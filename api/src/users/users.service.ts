import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';
import {
  LastOwnerProtectedError,
  PasswordTooShortError,
  SelfDisableForbiddenError,
  ShopAssignmentInvalidError,
  UsernameTakenError,
} from './errors';

// User rules per phase-2.md §3 (users). Every rule that touches sessions or
// role transitions runs in a single prisma.$transaction so a half-applied
// state (e.g. sessions killed but role unchanged) is not observable.

const OWNER_MIN_PASSWORD = 8;
const NON_OWNER_MIN_PASSWORD = 6;

export type UserOut = {
  id: string;
  name: string;
  username: string;
  role: Role;
  assignedShopId: string | null;
  assignedShopName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListUsersQueryDto): Promise<Paginated<UserOut>> {
    const where: Prisma.UserWhereInput = {};
    if (!q.includeInactive) where.active = true;
    if (q.role) where.role = q.role;
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { username: { contains: s, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { assignedShop: { select: { name: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPaginated(rows.map(mapRow), total, q.page, q.pageSize);
  }

  async create(dto: CreateUserDto): Promise<UserOut> {
    this.enforcePasswordPolicy(dto.role, dto.password);
    await this.validateShopAssignment(dto.role, dto.assignedShopId ?? null);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    try {
      const row = await this.prisma.user.create({
        data: {
          name: dto.name,
          username: dto.username,
          passwordHash,
          role: dto.role,
          assignedShopId: dto.role === Role.SHOP ? (dto.assignedShopId ?? null) : null,
          active: true,
        },
        include: { assignedShop: { select: { name: true } } },
      });
      return mapRow(row);
    } catch (err) {
      if (isUniqueUsernameError(err)) throw new UsernameTakenError();
      throw err;
    }
  }

  async update(id: string, actorId: string, dto: UpdateUserDto): Promise<UserOut> {
    const existing = await this.getOrThrow(id);
    const nextRole = dto.role ?? existing.role;
    const nextShopId =
      dto.assignedShopId === undefined
        ? existing.assignedShopId
        : dto.assignedShopId;

    if (nextRole !== existing.role || dto.assignedShopId !== undefined) {
      await this.validateShopAssignment(nextRole, nextShopId);
    }

    // Last-owner protection: demoting the only active OWNER is blocked.
    if (existing.role === Role.OWNER && nextRole !== Role.OWNER && existing.active) {
      await this.assertNotLastOwner(existing.id);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      return tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          role: dto.role,
          assignedShopId:
            dto.assignedShopId === undefined
              ? undefined
              : nextRole === Role.SHOP
                ? (dto.assignedShopId ?? null)
                : null,
        },
        include: { assignedShop: { select: { name: true } } },
      });
    });
    void actorId; // Reserved for future audit logging.
    return mapRow(row);
  }

  async disable(id: string, actorId: string): Promise<UserOut> {
    if (id === actorId) throw new SelfDisableForbiddenError();
    const existing = await this.getOrThrow(id);
    if (existing.role === Role.OWNER && existing.active) {
      await this.assertNotLastOwner(existing.id);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: false },
        include: { assignedShop: { select: { name: true } } },
      });
      // Kill all sessions immediately — the disabled user shouldn't be able
      // to keep browsing on an existing cookie (mirrors SessionGuard behavior).
      await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
    return mapRow(row);
  }

  async enable(id: string): Promise<UserOut> {
    await this.getOrThrow(id);
    const row = await this.prisma.user.update({
      where: { id },
      data: { active: true },
      include: { assignedShop: { select: { name: true } } },
    });
    return mapRow(row);
  }

  // Returns the one-time generated password. Callers surface it once and never
  // store it — the hash is what persists (auth.service pattern).
  async resetPassword(id: string): Promise<{ user: UserOut; generatedPassword: string }> {
    const existing = await this.getOrThrow(id);
    const generatedPassword = generateReadablePassword(
      existing.role === Role.OWNER ? OWNER_MIN_PASSWORD + 4 : NON_OWNER_MIN_PASSWORD + 4,
    );
    const passwordHash = await argon2.hash(generatedPassword, { type: argon2.argon2id });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { passwordHash },
        include: { assignedShop: { select: { name: true } } },
      });
      // Any session using the old password is now invalid — nuke them so the
      // user is forced to log in with the new password everywhere.
      await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
    return { user: mapRow(row), generatedPassword };
  }

  private enforcePasswordPolicy(role: Role, password: string): void {
    const min = role === Role.OWNER ? OWNER_MIN_PASSWORD : NON_OWNER_MIN_PASSWORD;
    if (password.length < min) throw new PasswordTooShortError(min);
  }

  private async validateShopAssignment(
    role: Role,
    assignedShopId: string | null,
  ): Promise<void> {
    if (role === Role.SHOP) {
      if (!assignedShopId) {
        throw new ShopAssignmentInvalidError('SHOP user requires an assignedShopId');
      }
      const shop = await this.prisma.shop.findUnique({ where: { id: assignedShopId } });
      if (!shop || !shop.active) {
        throw new ShopAssignmentInvalidError('Assigned shop does not exist or is archived');
      }
    } else if (assignedShopId) {
      throw new ShopAssignmentInvalidError(
        'Only SHOP users can have an assignedShopId',
      );
    }
  }

  private async assertNotLastOwner(currentId: string): Promise<void> {
    const otherOwners = await this.prisma.user.count({
      where: { role: Role.OWNER, active: true, NOT: { id: currentId } },
    });
    if (otherOwners === 0) throw new LastOwnerProtectedError();
  }

  private async getOrThrow(id: string) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new ResourceNotFoundError('User', id);
    return found;
  }
}

function mapRow(
  row: Prisma.UserGetPayload<{ include: { assignedShop: { select: { name: true } } } }>,
): UserOut {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    assignedShopId: row.assignedShopId,
    assignedShopName: row.assignedShop?.name ?? null,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueUsernameError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = (err.meta as { target?: string[] } | undefined)?.target;
  return Array.isArray(target) ? target.includes('username') : true;
}

// Alphanumeric-only, avoiding easily-confused chars (0/O, 1/l/I). Shown to the
// owner once, so it should be typable on a phone.
function generateReadablePassword(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}
