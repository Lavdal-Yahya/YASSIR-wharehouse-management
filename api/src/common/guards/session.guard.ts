import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest, SessionUser } from '../types/session-user';

// Global. Runs on every request.
// - @Public() routes are allowed straight through, no user attached.
// - Otherwise: reads the `sid` cookie, loads the session + user, and attaches
//   { id, name, role, assignedShopId } to req.user. Rejects with 401 on any
//   failure (missing cookie, unknown session, expired session, inactive user).
// - Opportunistically deletes the row for a session that fails the expiry check.

export const SESSION_COOKIE = 'sid';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Authentication required');

    const session = await this.prisma.session.findUnique({
      where: { id: token },
      include: { user: true },
    });

    if (!session) throw new UnauthorizedException('Authentication required');

    if (session.expiresAt.getTime() <= Date.now()) {
      // Best-effort cleanup; ignore failures so we still return 401.
      await this.prisma.session.delete({ where: { id: token } }).catch(() => undefined);
      throw new UnauthorizedException('Authentication required');
    }

    if (!session.user.active) {
      // Disabled user → kill this session immediately.
      await this.prisma.session.delete({ where: { id: token } }).catch(() => undefined);
      throw new UnauthorizedException('Authentication required');
    }

    const user: SessionUser = {
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      assignedShopId: session.user.assignedShopId,
    };
    (req as AuthenticatedRequest).user = user;
    return true;
  }
}
