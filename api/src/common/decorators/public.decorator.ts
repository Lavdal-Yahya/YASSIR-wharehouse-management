import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:public';

// Mark a route (or whole controller) as public — bypasses SessionGuard + RolesGuard.
// Use sparingly: /auth/login, health checks, and public settings only.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
