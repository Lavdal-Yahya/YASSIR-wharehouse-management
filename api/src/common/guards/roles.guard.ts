import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../types/session-user';

// Global. Runs after SessionGuard.
// - @Public() routes are allowed through.
// - Any other route MUST declare @Roles(...). If it doesn't, we reject: an
//   undecorated route on an authenticated controller is almost always a bug,
//   and failing closed here catches it (architecture.md §4, phase-1.md §3).
// - If declared, the user's role must be in the set.

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!allowed || allowed.length === 0) {
      // Route on an authenticated controller with no @Roles() — fail closed.
      throw new ForbiddenException('Route missing role declaration');
    }

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
