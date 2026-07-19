// Mirror of Prisma enums. Keep in sync manually — conventions.md §3.
export const Role = {
  OWNER: 'OWNER',
  WAREHOUSE: 'WAREHOUSE',
  SHOP: 'SHOP',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
