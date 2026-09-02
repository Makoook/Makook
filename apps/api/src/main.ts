import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.enableShutdownHooks();

  const trustProxyHops = Number(
    process.env.TRUST_PROXY_HOPS ?? '0',
  );

  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    throw new Error(
      'TRUST_PROXY_HOPS must be an integer between 0 and 10',
    );
  }

  app.set('trust proxy', trustProxyHops);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: [],
    maxAge: 86400,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();