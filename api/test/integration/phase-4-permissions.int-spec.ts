import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// Phase 4 #11 backfill (per phase-5.md §0 gate). Three assertions:
//   (a) SHOP → 403 on every /transfers route.
//   (b) WAREHOUSE → 403 on /transfers/:id/reverse (OWNER only).
//   (c) The ShopScopeGuard contract for the inventory read endpoint:
//       a SHOP user asking for another shop's location gets **their own**
//       shop's balances, not a 403 and not the foreign shop's data.

describe('phase-4 #11 · transfers permissions + ShopScopeGuard substitution', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    resetThrottler(app);
    await resetDatabase(prisma);
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({
      where: {
        OR: [
          { username: { startsWith: 'owner-' } },
          { username: { startsWith: 'warehouse-' } },
          { username: { startsWith: 'shop-' } },
        ],
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('(a) SHOP → 403 on /transfers', () => {
    it.each([
      { method: 'get' as const, path: '/api/transfers' },
      { method: 'get' as const, path: '/api/transfers/does-not-matter' },
      { method: 'post' as const, path: '/api/transfers', body: {} },
      {
        method: 'post' as const,
        path: '/api/transfers/does-not-matter/reverse',
        body: { reason: 'x' },
      },
    ])('$method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const req = agent[method](path);
      const res = body === undefined ? await req : await req.send(body);
      expect(res.status).toBe(403);
    });
  });

  describe('(b) WAREHOUSE → 403 on reverse', () => {
    it('POST /transfers/:id/reverse is rejected for WAREHOUSE (OWNER-only)', async () => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const res = await agent
        .post('/api/transfers/does-not-matter/reverse')
        .send({ reason: 'x' });
      expect(res.status).toBe(403);
    });

    it('sanity: WAREHOUSE still reaches GET /transfers (200)', async () => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const res = await agent.get('/api/transfers');
      expect(res.status).toBe(200);
    });
  });

  describe('(c) ShopScopeGuard substitution on /inventory/:locationId', () => {
    it('SHOP asking for another shop\'s locationId gets its own shop\'s data', async () => {
      // Two independent shops. shopA is the logged-in user; shopB is the
      // "foreign" location the client will try to point at.
      const shopA = await loginAs(app, prisma, 'SHOP');
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 8)}` },
      });
      const shopBLocation = await prisma.location.create({
        data: {
          name: 'foreign',
          type: 'SHOP',
          shopId: shopB.id,
          active: true,
        },
      });

      // Seed a product into each shop with distinct quantities so we can
      // tell the two response payloads apart without ambiguity.
      const category = await prisma.category.create({
        data: { name: `cat-${Math.random().toString(36).slice(2, 6)}` },
      });
      const productA = await prisma.product.create({
        data: { name: 'ownProd', categoryId: category.id },
      });
      const productB = await prisma.product.create({
        data: { name: 'foreignProd', categoryId: category.id },
      });
      await prisma.inventoryBalance.create({
        data: {
          locationId: shopA.locationId!,
          productId: productA.id,
          quantity: 7,
        },
      });
      await prisma.inventoryBalance.create({
        data: {
          locationId: shopBLocation.id,
          productId: productB.id,
          quantity: 99,
        },
      });

      // Request shopB's locationId while authenticated as shopA. The guard
      // contract says we get shopA's balances back — same as if we'd asked
      // for our own id in the first place.
      const res = await shopA.agent
        .get(`/api/inventory/${shopBLocation.id}`)
        .expect(200);
      const productIds = (res.body.items as Array<{ productId: string }>).map(
        (r) => r.productId,
      );
      // Assert substitution: response contains only shopA's product.
      expect(productIds).toContain(productA.id);
      expect(productIds).not.toContain(productB.id);
    });
  });
});
