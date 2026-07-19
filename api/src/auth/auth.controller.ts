import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SESSION_COOKIE } from '../common/guards/session.guard';
import type { SessionUser } from '../common/types/session-user';
import type { Env } from '../config/env';
import { AuthService, SESSION_TTL_MS } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 5 attempts per minute per IP — protects against credential stuffing.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, token, expiresAt } = await this.auth.login(dto.username, dto.password);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(expiresAt));
    return { user };
  }

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions(new Date(0)));
    return { ok: true };
  }

  @Roles(Role.OWNER, Role.WAREHOUSE, Role.SHOP)
  @Get('me')
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }

  private cookieOptions(expires: Date): {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    expires: Date;
    maxAge: number;
  } {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      expires,
      maxAge: SESSION_TTL_MS,
    };
  }
}
