import { Role } from '@prisma/client';

// The minimal user context attached to req.user for every authenticated request.
// SHOP users always carry a non-null assignedShopId; the guards enforce it.
export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  assignedShopId: string | null;
};

// Express's Request already carries `user?: unknown`; we assert this shape at
// the boundary (SessionGuard) and read it via the CurrentUser decorator.
export type AuthenticatedRequest = import('express').Request & {
  user: SessionUser;
};
