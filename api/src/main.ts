import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import { AppModule } from './app.module';
import { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  app.setGlobalPrefix('api', {
    // Static uploads are served from the root, outside the /api prefix, so
    // <img src="/uploads/products/xxx.webp" /> works directly. In prod Caddy
    // takes over.
    exclude: ['uploads/(.*)'],
  });
  app.useStaticAssets(
    process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads'),
    {
      prefix: '/uploads/',
      // 1 day — files are content-hashed by cuid so a change means a new URL.
      maxAge: 24 * 60 * 60 * 1000,
    },
  );
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
