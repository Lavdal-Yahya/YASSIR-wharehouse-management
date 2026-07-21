import type { INestApplication } from '@nestjs/common';
import type { Role } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

// loginAs — the HTTP test harness that Phase 5's gate demanded.
//
// It seeds a real user of the requested role (with a paired shop location
// for SHOP), performs a real POST /api/auth/login to exercise the
// SessionGuard's whole cookie path, captures the sid cookie, and returns
// an object with:
//   - agent: supertest.agent bound to the app and carrying the cookie
//   - user: the SessionUser as the server sees it
//   - shopId / locationId: only for SHOP (the shop it's assigned to)
//
// Guard unit tests can't prove the SHOP → 403 or ShopScopeGuard
// substitution stories — this does, because the request travels the same
// middleware chain a browser does.

const PASSWORD = 'test-password-1234';

export type LoginResult = {
  agent: ReturnType<typeof request.agent>;
  cookie: string;
  user: { id: string; name: string; role: Role; assignedShopId: string | null };
  shopId?: string;
  locationId?: string;
};

export type LoginOptions = {
  // When true (SHOP only), reuses an existing shop rather than creating a
  // new one — useful when several SHOP users share the same location.
  shopId?: string;
};

export async function loginAs(
  app: INestApplication,
  prisma: PrismaService,
  role: Role,
  opts: LoginOptions = {},
): Promise<LoginResult> {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

  let assignedShopId: string | null = null;
  let locationId: string | undefined;
  if (role === 'SHOP') {
    if (opts.shopId) {
      assignedShopId = opts.shopId;
      const loc = await prisma.location.findFirst({
        where: { shopId: opts.shopId },
        select: { id: true },
      });
      locationId = loc?.id;
    } else {
      // Pair Shop + Location the same way ShopsService.create does so the
      // SHOP user has a valid location to be substituted onto.
      const shopName = `shop-${Math.random().toString(36).slice(2, 8)}`;
      const shop = await prisma.shop.create({ data: { name: shopName } });
      const loc = await prisma.location.create({
        data: { name: shopName, type: 'SHOP', shopId: shop.id, active: true },
      });
      assignedShopId = shop.id;
      locationId = loc.id;
    }
  }

  const username = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: `Test ${role}`,
      username,
      passwordHash,
      role,
      assignedShopId,
      active: true,
    },
  });

  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post('/api/auth/login')
    .send({ username, password: PASSWORD });

  if (res.status !== 200) {
    throw new Error(
      `loginAs(${role}) failed with status ${res.status}: ${res.text}`,
    );
  }
  // Extract sid cookie so callers that build their own agent (e.g. for
  // negative tests that hit routes with a stale cookie) can pass it back.
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');

  return {
    agent,
    cookie: cookieHeader,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      assignedShopId: user.assignedShopId,
    },
    ...(assignedShopId ? { shopId: assignedShopId } : {}),
    ...(locationId ? { locationId } : {}),
  };
}
