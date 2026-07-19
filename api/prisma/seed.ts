// Idempotent seed. Safe to re-run: existing rows are left alone.
// Creates the central warehouse Location, baseline AppSettings, and the initial
// OWNER user from SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD env vars.

import { PrismaClient, LocationType, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedWarehouseLocation() {
  const existing = await prisma.location.findFirst({
    where: { type: LocationType.WAREHOUSE, shopId: null },
  });
  if (existing) {
    console.log(`  warehouse location: kept (${existing.name})`);
    return;
  }
  const created = await prisma.location.create({
    data: { name: 'Entrepôt central', type: LocationType.WAREHOUSE, shopId: null },
  });
  console.log(`  warehouse location: created (${created.name})`);
}

async function seedAppSettings() {
  const defaults: Record<string, string> = {
    businessName: '',
    currency: 'MRU',
    receiptFooter: '',
  };
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await prisma.appSetting.findUnique({ where: { key } });
    if (existing) {
      console.log(`  setting ${key}: kept`);
      continue;
    }
    await prisma.appSetting.create({ data: { key, value } });
    console.log(`  setting ${key}: created`);
  }
}

async function seedOwnerUser() {
  const anyOwner = await prisma.user.findFirst({ where: { role: Role.OWNER } });
  if (anyOwner) {
    console.log(`  owner user: kept (${anyOwner.username})`);
    return;
  }
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set when no OWNER user exists',
    );
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const created = await prisma.user.create({
    data: {
      name: 'Administrator',
      username,
      passwordHash,
      role: Role.OWNER,
      assignedShopId: null,
      active: true,
    },
  });
  console.log(`  owner user: created (${created.username})`);
}

async function main() {
  console.log('Seeding...');
  await seedWarehouseLocation();
  await seedAppSettings();
  await seedOwnerUser();
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
