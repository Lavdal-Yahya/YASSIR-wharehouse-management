import type { Role } from '@/shared/enums';

export type User = {
  id: string;
  name: string;
  username: string;
  role: Role;
  assignedShopId: string | null;
  assignedShopName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserBody = {
  name: string;
  username: string;
  password: string;
  role: Role;
  assignedShopId?: string | null;
};

export type UpdateUserBody = {
  name?: string;
  role?: Role;
  assignedShopId?: string | null;
};
