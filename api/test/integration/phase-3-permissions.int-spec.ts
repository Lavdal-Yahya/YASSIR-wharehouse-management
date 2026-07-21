import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// Phase 3 #12 backfill (per phase-5.md §0 gate). SHOP role must be
// rejected with 403 on every warehouse-side endpoint. Phase 3 unit-tested
// the RolesGuard directly; that proved the guard, not the wiring. This
// suite proves the wiring by driving each endpoint through the full HTTP
// stack with a real SHOP session cookie.
//
// Endpoints covered (WAREHOUSE + OWNER only — never SHOP):
//   /incoming-orders          GET, POST
//   /incoming-orders/:id      GET, PATCH
//   /incoming-orders/:id/receive   POST
//   /incoming-orders/:id/cancel    POST
//   /stock-receipts           GET
//   /stock-receipts/:id       GET
//   /stock-receipts/direct    POST
//   /inventory/corrections    GET, POST
//   /inventory/movements      GET
//   /inventory/opening-stock  POST (OWNER-only; SHOP still 403)
//
// GET /inventory/:locationId is deliberately excluded — SHOP has access
// to that route via ShopScopeGuard; its own test lives in the P4 matrix.

const WAREHOUSE_ENDPOINTS: Array<{
  method: 'get' | 'post' | 'patch';
  path: string;
  body?: unknown;
}> = [
  { method: 'get', path: '/api/incoming-orders' },
  { method: 'post', path: '/api/incoming-orders', body: {} },
  { method: 'get', path: '/api/incoming-orders/does-not-matter' },
  { method: 'patch', path: '/api/incoming-orders/does-not-matter', body: {} },
  { method: 'post', path: '/api/incoming-orders/does-not-matter/receive', body: {} },
  { method: 'post', path: '/api/incoming-orders/does-not-matter/cancel', body: { reason: 'x' } },
  { method: 'get', path: '/api/stock-receipts' },
  { method: 'get', path: '/api/stock-receipts/does-not-matter' },
  { method: 'post', path: '/api/stock-receipts/direct', body: {} },
  { method: 'get', path: '/api/inventory/corrections' },
  { method: 'post', path: '/api/inventory/corrections', body: {} },
  { method: 'get', path: '/api/inventory/movements' },
  { method: 'post', path: '/api/inventory/opening-stock', body: {} },
];

describe('phase-3 #12 · SHOP → 403 on every warehouse endpoint', () => {
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

  it.each(WAREHOUSE_ENDPOINTS)(
    '$method $path → 403 for SHOP',
    async ({ method, path, body }) => {
      const { agent } = await loginAs(app, prisma, 'SHOP');
      const req = agent[method](path);
      const res = body === undefined ? await req : await req.send(body);
      // 403 (RolesGuard rejected) is the whole point. Not 400 (validation
      // fired first), not 404 (route missing) — 403.
      expect(res.status).toBe(403);
    },
  );

  it('sanity: WAREHOUSE reaches /incoming-orders (not blocked by role)', async () => {
    const { agent } = await loginAs(app, prisma, 'WAREHOUSE');
    const res = await agent.get('/api/incoming-orders');
    expect(res.status).toBe(200);
  });
});
