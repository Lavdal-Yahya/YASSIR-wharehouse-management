import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, SessionUser } from '../types/session-user';

// Only usable on routes protected by SessionGuard — otherwise the request has
// no `user` attached and this returns undefined.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);
