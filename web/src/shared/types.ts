import type { Role } from './enums';

// Matches api/src/common/types/session-user.ts. Update both sides together.
export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  assignedShopId: string | null;
};

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
};
