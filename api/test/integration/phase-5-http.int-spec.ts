import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { OpeningStockService } from '../../src/inventory/opening-stock.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// Phase 5 HTTP-level suite (P5-08 items 8, 11). Covers the parts of
// the phase-5 §6 test list that only make sense over the wire:
//   - Tampered client money: whitelist ValidationPipe strips fake
//     lineTotal/totalAmount fields (proves the pipe, not just the DTO).
//   - Permissions matrix: WAREHOUSE gets 403 on every /sales endpoint;
//     SHOP posting with a foreign shopId lands the sale in **their own**
//     shop (ShopScopeGuard substitution); SHOP fetching a foreign sale
//     id gets 404, not 403 (no existence leak, spec §29.3).

describe('phase-5 · HTTP surface', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sales: SalesService;
  let opening: OpeningStockService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sales = app.get(SalesService);
    opening = app.get(OpeningStockService);
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

  async function seedProduct(name = 'p'): Promise<string> {
    const cat = await prisma.category.create({
      data: { name: `c-${Math.random().toString(36).slice(2, 6)}` },
    });
    const p = await prisma.product.create({ data: { name, categoryId: cat.id } });
    return p.id;
  }

  describe('(11a) WAREHOUSE → 403 on every /sales route', () => {
    it.each([
      { method: 'get' as const, path: '/api/sales' },
      { method: 'get' as const, path: '/api/sales/does-not-matter' },
      { method: 'post' as const, path: '/api/sales', body: {} },
    ])('$method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const req = agent[method](path);
      const res = body === undefined ? await req : await req.send(body);
      expect(res.status).toBe(403);
    });
  });

  describe('(11b) SHOP posting with a foreign shopId → sale lands in own shop', () => {
    it('substitutes body.shopId to the SHOP user\'s assignedShopId', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      // A separate shop the SHOP user should not be able to write to.
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 6)}` },
      });
      const shopBLoc = await prisma.location.create({
        data: {
          name: 'foreign',
          type: 'SHOP',
          shopId: shopB.id,
          active: true,
        },
      });

      // Stock at shopA (client asks for shopB but the guard rewrites).
      const productId = await seedProduct();
      await opening.create(
        { locationId: shopA.locationId!, items: [{ productId, quantity: 5 }] },
        shopA.user,
      );

      const res = await shopA.agent.post('/api/sales').send({
        shopId: shopB.id, // spoof attempt
        amountPaidAtSale: 1_000,
        items: [{ productId, quantity: 1, unitPrice: 1_000 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.shopId).toBe(shopA.shopId);

      // Belt: shopB's location has zero movements from this test's sale.
      const salesInShopB = await prisma.sale.count({ where: { shopId: shopB.id } });
      expect(salesInShopB).toBe(0);
      // Suspress unused-warning on shopBLoc — it's here for symmetry / to
      // prove the shop existed with a real location, not to be queried.
      expect(shopBLoc.id).toBeTruthy();
    });
  });

  describe('(11c) SHOP fetching a foreign sale id → 404, not 403', () => {
    it('foreign sale id → 404 without leaking existence', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 6)}` },
      });
      const shopBLoc = await prisma.location.create({
        data: { name: 'foreign', type: 'SHOP', shopId: shopB.id, active: true },
      });
      // Owner-authored sale in shopB. We reach past the HTTP layer here
      // (createHarness sales instance) so the setup stays terse.
      const productId = await seedProduct();
      await opening.create(
        { locationId: shopBLoc.id, items: [{ productId, quantity: 3 }] },
        {
          id: shopA.user.id, // any user id is fine; opening stock only records createdBy
          name: 'x',
          role: 'OWNER',
          assignedShopId: null,
        },
      );
      const foreignSale = await sales.confirm(
        {
          shopId: shopB.id,
          amountPaidAtSale: 1_000,
          items: [{ productId, quantity: 1, unitPrice: 1_000 }],
        },
        { id: shopA.user.id, name: 'x', role: 'OWNER', assignedShopId: null },
      );

      const res = await shopA.agent.get(`/api/sales/${foreignSale.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('(8) tampered client money is stripped by the whitelist pipe', () => {
    it('client-supplied lineTotal/totalAmount are ignored; server totals win', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      const productId = await seedProduct();
      await opening.create(
        { locationId: shopA.locationId!, items: [{ productId, quantity: 5 }] },
        shopA.user,
      );

      const res = await shopA.agent.post('/api/sales').send({
        shopId: shopA.shopId,
        amountPaidAtSale: 3_000,
        // Fake totals — the whitelist pipe with forbidNonWhitelisted
        // returns 400 rather than silently stripping. This test proves
        // the pipe is wired: a client that "helpfully" sends totals gets
        // rejected up front, so the confirmed sale can never carry them.
        totalAmount: 1,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: 3_000,
            lineTotal: 1, // fake
          },
        ],
      });
      expect(res.status).toBe(400);

      // Now send a well-formed request. Server-computed totalAmount is
      // exactly quantity × unitPrice — no client contribution.
      const clean = await shopA.agent.post('/api/sales').send({
        shopId: shopA.shopId,
        amountPaidAtSale: 3_000,
        items: [{ productId, quantity: 1, unitPrice: 3_000 }],
      });
      expect(clean.status).toBe(201);
      expect(clean.body.totalAmount).toBe(3_000);
      expect(clean.body.items[0].lineTotal).toBe(3_000);
    });
  });
});
