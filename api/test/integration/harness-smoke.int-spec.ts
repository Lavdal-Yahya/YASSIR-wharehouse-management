import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, resetThrottler } from '../utils/app';
import { loginAs } from '../utils/login-as';
import { resetDatabase } from './setup';

// Smoke test for the Phase 5 gate harness. Cheap proof that createTestApp
// + loginAs actually stand up the whole middleware chain (SessionGuard,
// RolesGuard, ValidationPipe, cookieParser) and produce an agent whose
// requests are authenticated as the requested role.

describe('auth E2E harness', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    resetThrottler(app);
    // Full reset — the same helper the phase-3/4 suites use. It clears
    // inventory rows first so transient shop locations can be dropped
    // cleanly, then resets the seeded shop/user rows we create here.
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

  it('OWNER agent hits /auth/me and reads its own user', async () => {
    const { agent, user } = await loginAs(app, prisma, 'OWNER');
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.role).toBe('OWNER');
  });

  it('SHOP agent carries assignedShopId + can hit /auth/me', async () => {
    const { agent, user, shopId, locationId } = await loginAs(app, prisma, 'SHOP');
    expect(shopId).toBeTruthy();
    expect(locationId).toBeTruthy();
    expect(user.assignedShopId).toBe(shopId);
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.assignedShopId).toBe(shopId);
  });

  it('unauthenticated request → 401 (proves SessionGuard is wired)', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});
