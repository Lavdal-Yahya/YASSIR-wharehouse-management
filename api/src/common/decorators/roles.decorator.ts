import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';

// Attach the set of roles allowed to access a route. Missing @Roles() on a
// non-public route means the route is unreachable (fails closed) — see
// RolesGuard. Always list every allowed role explicitly.
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
