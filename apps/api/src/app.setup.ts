import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { Logger } from '@nestjs/common';
import { bodyParsing, bodyParsingErrorHandler } from './common/http/body-parsing';
import { ADMIN_PREFIX } from './common/errors/error-format';
import { AppConfig } from './config/app-config.service';

/**
 * HTTP pipeline shared by main.ts and the integration tests. The app must be created with
 * `bodyParser: false`: RustDesk-facing routes need their own body handling.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  // req.ip honours X-Forwarded-For only from TRUSTED_PROXIES (addresses or CIDRs).
  const proxies = config.get('TRUSTED_PROXIES');
  app.set('trust proxy', proxies.length > 0 ? proxies : false);
  app.disable('x-powered-by');

  app.use(helmet());
  // CORS only for the admin panel; RustDesk clients are not browsers.
  app.use(
    ADMIN_PREFIX,
    cors({
      origin: config.get('ADMIN_ALLOWED_ORIGINS'),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use(cookieParser());
  app.use(bodyParsing);
  app.use(bodyParsingErrorHandler);
  app.enableShutdownHooks();

  if (!config.get('ADMIN_COOKIE_SECURE')) {
    new Logger('Bootstrap').warn(
      'ADMIN_COOKIE_SECURE=false: the admin session cookie is sent over plain HTTP. Use only for local development.',
    );
  }
}
