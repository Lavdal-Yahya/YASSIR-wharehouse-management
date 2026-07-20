import type { Prisma } from '@prisma/client';

// The transaction client passed by `prisma.$transaction(async (tx) => ...)`.
// Every stock- or money-writing service takes this instead of PrismaService
// so the operation happens inside the caller's transaction (architecture §3.4).
export type Tx = Prisma.TransactionClient;
