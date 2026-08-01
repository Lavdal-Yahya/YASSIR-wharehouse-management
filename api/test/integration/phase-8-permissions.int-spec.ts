import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// P8-01 — Permission sweep for controllers not fully covered by prior
// phase-level permission suites.
//
// Prior coverage:
//   phase-3-permissions: /incoming-orders, /stock-receipts, /inventory
//   phase-4-permissions: /transfers
//   phase-5-http:        /sales (WAREHOUSE → 403 sweep + ShopScopeGuard)
//   phase-7-http:        /expenses (WAREHOUSE), /reports (role matrix)
//
// This file covers the remaining controllers:
//   /customers  — WAREHOUSE cannot mutate; SHOP/WAREHOUSE cannot archive/restore
//   /payments   — WAREHOUSE → 403 on all; SHOP → 403 on reverse
//   /sales      — SHOP → 403 on cancel (OWNER-only action)
//   /users      — only OWNER
//   /shops      — only OWNER (except /shops/mine)
//   /settings   — PUT/POST(logo) OWNER-only
//   /categories — POST/PATCH/archive OWNER-only
//   /expense-categories — POST/PATCH/archive OWNER-only
//   /products   — POST OWNER/WAREHOUSE only (SHOP → 403 on create);
//                 PATCH OWNER/WAREHOUSE/SHOP but SHOP cannot rewrite
//                 defaultPurchaseCost (silently stripped by the service).

describe('P8-01 · permission sweep', () => {
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

  // ---------------------------------------------------------------------------
  // /customers — WAREHOUSE blocked on mutations
  // ---------------------------------------------------------------------------
  describe('/customers — WAREHOUSE blocked on mutations', () => {
    it.each([
      { method: 'patch' as const, path: '/api/customers/does-not-matter', body: {} },
      { method: 'post' as const, path: '/api/customers/does-not-matter/archive', body: {} },
      { method: 'post' as const, path: '/api/customers/does-not-matter/restore', body: {} },
    ])('WAREHOUSE · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const res = await agent[method](path).send(body);
      expect(res.status).toBe(403);
    });

    it.each([
      { method: 'post' as const, path: '/api/customers/does-not-matter/archive', body: {} },
      { method: 'post' as const, path: '/api/customers/does-not-matter/restore', body: {} },
    ])('SHOP · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent[method](path).send(body);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /payments — WAREHOUSE blocked on all routes
  // ---------------------------------------------------------------------------
  describe('/payments — WAREHOUSE → 403 on all routes', () => {
    it.each([
      { method: 'get' as const, path: '/api/payments' },
      { method: 'get' as const, path: '/api/payments/does-not-matter' },
      { method: 'post' as const, path: '/api/payments', body: {} },
      { method: 'post' as const, path: '/api/payments/does-not-matter/reverse', body: {} },
    ])('WAREHOUSE · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const req = agent[method](path);
      const res = body !== undefined ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /payments/:id/reverse — OWNER only (SHOP → 403)
  // ---------------------------------------------------------------------------
  describe('/payments — SHOP → 403 on reverse', () => {
    it('SHOP · POST /payments/:id/reverse → 403', async () => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent.post('/api/payments/does-not-matter/reverse').send({ reason: 'x' });
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /sales/:id/cancel — OWNER only (SHOP → 403)
  // ---------------------------------------------------------------------------
  describe('/sales — SHOP → 403 on cancel', () => {
    it('SHOP · POST /sales/:id/cancel → 403', async () => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent.post('/api/sales/does-not-matter/cancel').send({ reason: 'x' });
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /users — OWNER only
  // ---------------------------------------------------------------------------
  describe('/users — SHOP and WAREHOUSE → 403', () => {
    const USER_PATHS = [
      { method: 'get' as const, path: '/api/users' },
      { method: 'post' as const, path: '/api/users', body: {} },
      { method: 'patch' as const, path: '/api/users/does-not-matter', body: {} },
      { method: 'post' as const, path: '/api/users/does-not-matter/disable', body: {} },
      { method: 'post' as const, path: '/api/users/does-not-matter/enable', body: {} },
      { method: 'post' as const, path: '/api/users/does-not-matter/reset-password', body: {} },
    ];

    it.each(USER_PATHS)('SHOP · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const req = agent[method](path);
      const res = body !== undefined ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });

    it.each(USER_PATHS)('WAREHOUSE · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const req = agent[method](path);
      const res = body !== undefined ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /shops — OWNER-only routes (SHOP and WAREHOUSE → 403)
  // ---------------------------------------------------------------------------
  describe('/shops — OWNER-only routes → 403 for SHOP and WAREHOUSE', () => {
    const OWNER_SHOP_PATHS = [
      { method: 'get' as const, path: '/api/shops' },
      { method: 'get' as const, path: '/api/shops/does-not-matter' },
      { method: 'post' as const, path: '/api/shops', body: {} },
      { method: 'patch' as const, path: '/api/shops/does-not-matter', body: {} },
      { method: 'post' as const, path: '/api/shops/does-not-matter/archive', body: {} },
      { method: 'post' as const, path: '/api/shops/does-not-matter/restore', body: {} },
      { method: 'get' as const, path: '/api/shops/does-not-matter/stock-summary' },
    ];

    it.each(OWNER_SHOP_PATHS)('SHOP · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const req = agent[method](path);
      const res = body !== undefined ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });

    it.each(OWNER_SHOP_PATHS)('WAREHOUSE · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const req = agent[method](path);
      const res = body !== undefined ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /settings — mutations are OWNER-only
  // ---------------------------------------------------------------------------
  describe('/settings — mutations → 403 for SHOP and WAREHOUSE', () => {
    it.each([{ role: 'SHOP' as const }, { role: 'WAREHOUSE' as const }])(
      '$role · PUT /settings → 403',
      async ({ role }) => {
        const { agent } = await loginAs(app, prisma, role);
        expect((await agent.put('/api/settings').send({})).status).toBe(403);
      },
    );

    it.each([{ role: 'SHOP' as const }, { role: 'WAREHOUSE' as const }])(
      '$role · POST /settings/logo → 403',
      async ({ role }) => {
        const { agent } = await loginAs(app, prisma, role);
        expect((await agent.post('/api/settings/logo').send({})).status).toBe(403);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // /categories — OWNER-only mutations
  // ---------------------------------------------------------------------------
  describe('/categories — OWNER-only mutations → 403 for SHOP', () => {
    it.each([
      { method: 'post' as const, path: '/api/categories', body: {} },
      { method: 'patch' as const, path: '/api/categories/does-not-matter', body: {} },
      { method: 'post' as const, path: '/api/categories/does-not-matter/archive', body: {} },
    ])('SHOP · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent[method](path).send(body);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /expense-categories — OWNER-only mutations
  // ---------------------------------------------------------------------------
  describe('/expense-categories — OWNER-only mutations → 403 for SHOP', () => {
    it.each([
      { method: 'post' as const, path: '/api/expense-categories', body: {} },
      { method: 'patch' as const, path: '/api/expense-categories/does-not-matter', body: {} },
      {
        method: 'post' as const,
        path: '/api/expense-categories/does-not-matter/archive',
        body: {},
      },
    ])('SHOP · $method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent[method](path).send(body);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // /products — SHOP cannot create; can update but never touches the WAC.
  // ---------------------------------------------------------------------------
  describe('/products — SHOP create → 403; edit allowed but cost stripped', () => {
    it('SHOP · POST /api/products → 403', async () => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent.post('/api/products').send({});
      expect(res.status).toBe(403);
    });

    it('SHOP · PATCH updates editable fields and leaves defaultPurchaseCost untouched', async () => {
      const category = await prisma.category.create({
        data: { name: `cat-${Math.random().toString(36).slice(2, 8)}` },
      });
      const product = await prisma.product.create({
        data: {
          name: 'Original name',
          categoryId: category.id,
          defaultPurchaseCost: 1000,
          defaultSalePrice: 1500,
        },
      });

      const { agent } = await loginAs(app, prisma, 'SHOP');
      const res = await agent.patch(`/api/products/${product.id}`).send({
        name: 'Renamed by shop',
        // SHOP includes purchase cost — server must ignore it.
        defaultPurchaseCost: 9999,
        defaultSalePrice: 2000,
      });
      expect(res.status).toBe(200);

      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.name).toBe('Renamed by shop');
      expect(after.defaultPurchaseCost).toBe(1000);
      expect(after.defaultSalePrice).toBe(2000);
    });
  });
});
