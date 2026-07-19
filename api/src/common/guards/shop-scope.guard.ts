import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedRequest } from '../types/session-user';

// Built now, wired in Phase 2 alongside the first shop-scoped endpoints.
//
// For SHOP users: silently substitutes any client-supplied `shopId` in the
// body/query/params with the session's assignedShopId. The client is never
// trusted to declare its own scope — architecture.md §4.
//
// For OWNER/WAREHOUSE: leaves the request untouched.
//
// SHOP users without an assignedShopId (data inconsistency, should be
// impossible per users service) are rejected 403.

@Injectable()
export class ShopScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user.role !== Role.SHOP) return true;

    if (!req.user.assignedShopId) {
      throw new ForbiddenException('Shop user has no assigned shop');
    }
    const shopId = req.user.assignedShopId;

    substituteShopId(req.body, shopId);
    substituteShopId(req.query, shopId);
    substituteShopId(req.params, shopId);
    return true;
  }
}

function substituteShopId(target: unknown, shopId: string): void {
  if (target && typeof target === 'object' && 'shopId' in target) {
    (target as Record<string, unknown>).shopId = shopId;
  }
}
