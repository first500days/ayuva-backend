import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
