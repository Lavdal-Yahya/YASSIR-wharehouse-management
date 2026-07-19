import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { AuthInvalidCredentialsError } from './errors';

// Session lifetime — 12 hours. Shared devices favor shorter over longer;
// re-auth cost is one login screen (phase-1.md §3).
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  // Precomputed hash used as a "dummy verify" target for unknown usernames so
  // an attacker cannot enumerate accounts by measuring response time.
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('dummy-password-for-timing', {
      type: argon2.argon2id,
    });
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ user: SessionUser; token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findFirst({
      where: { username, active: true },
    });

    // Same code path + roughly the same CPU work whether the user exists or
    // not. Argon2 dominates the login latency; DB lookup is negligible.
    const valid = user
      ? await argon2.verify(user.passwordHash, password)
      : (await argon2.verify(this.dummyHash, password), false);

    if (!user || !valid) throw new AuthInvalidCredentialsError();

    // Housekeep: drop this user's expired sessions on every login.
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { id: token, userId: user.id, expiresAt },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        assignedShopId: user.assignedShopId,
      },
      token,
      expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    // deleteMany so an unknown/already-deleted token is a no-op, not a 404.
    await this.prisma.session.deleteMany({ where: { id: token } });
  }
}
