import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_VERSION } from './common/version';
import { AppConfig } from './config/app-config.service';
import { buildOpenApiDocument, SWAGGER_PATH } from './openapi/document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  const logger = new NestLogger('Bootstrap');
  configureApp(app);

  const config = app.get(AppConfig);
  if (config.swaggerEnabled) {
    SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
      jsonDocumentUrl: `${SWAGGER_PATH}/openapi.json`,
    });
  }

  const port = config.get('PORT');
  await app.listen(port, '0.0.0.0');
  logger.log(
    { port, version: APP_VERSION, env: config.get('NODE_ENV'), swagger: config.swaggerEnabled },
    'RustDesk API server started',
  );
}

bootstrap().catch((err: unknown) => {
  // Configuration errors list every invalid variable; print them as-is.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
