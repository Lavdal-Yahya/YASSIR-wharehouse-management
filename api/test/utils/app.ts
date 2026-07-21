import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';

// Bootstraps a real Nest app for HTTP-level tests. Mirrors src/main.ts as
// closely as it needs to for the auth/permission surface: cookie parser
// (session cookie is required by SessionGuard), /api global prefix (the
// controllers use it, the frontend expects it), and the whitelisting
// ValidationPipe (P5 tests assert that tampered totals are stripped).
//
// Static asset serving and CORS are skipped — supertest requests don't
// exercise them and they'd only slow the setup.

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['uploads/(.*)'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  await app.init();
  return app;
}

// Clears the in-memory throttler storage. Call in beforeEach for any
// HTTP suite that logs in multiple times per test — login is @Throttle'd
// to 5/min per IP and every test uses the same test-runner IP.
export function resetThrottler(app: INestApplication): void {
  const storage = app.get<ThrottlerStorageService>(ThrottlerStorage);
  storage.storage.clear();
}
