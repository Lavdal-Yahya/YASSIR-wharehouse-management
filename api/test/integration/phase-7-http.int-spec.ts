import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// Phase 7 · HTTP permission matrix (phase-7 §7 item 7).
//
// Guard unit tests can't prove the wire-level behaviour: SHOP scope
// substitution, WAREHOUSE hard-gate on money reports, 404-not-403
// for cross-shop expense access. This suite exercises every /reports/*
// and /expenses endpoint over the wire so a route accidentally left
// open would fail here.
//
// Layout mirrors phase-5-http.int-spec.ts: one describe per rule,
// short setup per test, no global-state assumptions between them.

describe('phase-7 · HTTP permission matrix', () => {
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
    // Drop any users the previous test's loginAs seeded so their
    // unique usernames don't collide with fresh ones.
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

  // ---------- Reports routes -----------------------------------------

  describe('WAREHOUSE → 403 on shop-money reports', () => {
    it.each([
      '/api/reports/shop',
      '/api/reports/sales',
      '/api/reports/debt',
      '/api/reports/estimated-profit',
    ])('GET %s → 403', async (path) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const res = await agent.get(path);
      expect(res.status).toBe(403);
    });
  });

  describe('SHOP → 403 on warehouse-side reports', () => {
    it.each(['/api/reports/warehouse', '/api/reports/incoming-orders'])(
      'GET %s → 403',
      async (path) => {
        const { agent } = await loginAs(app, prisma, 'SHOP');
        const res = await agent.get(path);
        expect(res.status).toBe(403);
      },
    );
  });

  describe('OWNER → 200 on every report route (baseline sanity)', () => {
    it.each([
      '/api/reports/shop',
      '/api/reports/sales',
      '/api/reports/debt',
      '/api/reports/estimated-profit',
      '/api/reports/warehouse',
      '/api/reports/incoming-orders',
    ])('GET %s → 200', async (path) => {
      const { agent } = await loginAs(app, prisma, 'OWNER');
      const res = await agent.get(path);
      expect(res.status).toBe(200);
    });
  });

  describe('SHOP → shop scope forced regardless of ?shopId query', () => {
    it('a spoofed shopId is silently rewritten to the SHOP user\'s shop', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 6)}` },
      });

      const res = await shopA.agent.get(
        `/api/reports/shop?shopId=${shopB.id}`,
      );
      expect(res.status).toBe(200);
      // The server responds with the resolved scope; that must be the
      // SHOP user's assigned shop, not the one they asked for.
      expect(res.body.scope.shopId).toBe(shopA.shopId);
    });
  });

  // ---------- Expenses routes ----------------------------------------

  describe('WAREHOUSE → 403 on every /expenses route', () => {
    it.each([
      { method: 'get' as const, path: '/api/expenses' },
      { method: 'get' as const, path: '/api/expenses/does-not-matter' },
      { method: 'post' as const, path: '/api/expenses', body: {} },
      { method: 'patch' as const, path: '/api/expenses/x', body: {} },
      { method: 'post' as const, path: '/api/expenses/x/cancel', body: {} },
    ])('$method $path → 403', async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
      const req = agent[method](path);
      const res = body === undefined ? await req : await req.send(body);
      expect(res.status).toBe(403);
    });
  });

  describe('SHOP posting an expense with a foreign shopId → lands in own shop', () => {
    it('substitutes body.shopId to the SHOP user\'s assignedShopId', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 6)}` },
      });

      const res = await shopA.agent.post('/api/expenses').send({
        shopId: shopB.id, // spoof
        amount: 500,
        description: 'test',
      });
      expect(res.status).toBe(201);
      expect(res.body.shopId).toBe(shopA.shopId);
    });
  });

  describe('SHOP fetching a foreign expense id → 404 (no existence leak)', () => {
    it('foreign expense id → 404, not 403', async () => {
      const shopA = await loginAs(app, prisma, 'SHOP');
      const shopB = await prisma.shop.create({
        data: { name: `foreign-${Math.random().toString(36).slice(2, 6)}` },
      });
      // Owner authors an expense in shopB via HTTP.
      const owner = await loginAs(app, prisma, 'OWNER');
      const create = await owner.agent.post('/api/expenses').send({
        shopId: shopB.id,
        amount: 100,
        description: 'foreign',
      });
      expect(create.status).toBe(201);
      const foreignId = create.body.id;

      const res = await shopA.agent.get(`/api/expenses/${foreignId}`);
      expect(res.status).toBe(404);
    });
  });
});
