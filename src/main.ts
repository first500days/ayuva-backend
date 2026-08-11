import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { scalarCustomCss } from './docs/scalar-theme';

const API_PREFIX = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });
  const config = app.get(ConfigService);

  // /health and /docs stay unprefixed/unversioned; all feature routes live under /api/v1 (TRD §4).
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['health', 'docs', 'openapi.json'],
  });

  // Wide-open origin (true) is fine for dev but not production — scope to an
  // explicit allowlist there. Unset in production means "reject all
  // cross-origin requests" (loud warning), not "allow all" — a demo/admin
  // portal that can't reach the API is an obvious, immediately-visible
  // failure, unlike a silently wide-open API.
  const nodeEnv = config.get<string>('nodeEnv');
  const corsAllowedOrigins = config.get<string>('corsAllowedOrigins');
  if (nodeEnv === 'production') {
    const origins = corsAllowedOrigins
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (!origins || origins.length === 0) {
      new Logger('Bootstrap').warn(
        'CORS_ALLOWED_ORIGINS is not set in production — rejecting all cross-origin requests. Set it to a comma-separated list of allowed origins (e.g. the admin portal domain).',
      );
    }
    app.enableCors({ origin: origins ?? false, credentials: true });
  } else {
    app.enableCors({ origin: true, credentials: true });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ayuva API')
    .setDescription(
      'Ayuva backend platform — patient app, admin portal, and AI services (TRD §4).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'Liveness/readiness')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Raw spec only — Scalar (below) is the served UI, not the default Swagger UI.
  SwaggerModule.setup('openapi', app, document, {
    ui: false,
    jsonDocumentUrl: 'openapi.json',
  });

  app.use(
    '/docs',
    apiReference({
      content: document,
      theme: 'default',
      customCss: scalarCustomCss,
      metaData: { title: 'Ayuva API Reference' },
    }),
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
}
void bootstrap();
