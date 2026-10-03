import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app-config.service';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Fields that never reach the logs, at any depth we log. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...['password', 'hash', 'access_token', 'passwordHash', 'token', 'secret'].flatMap((k) => [
    k,
    `*.${k}`,
    `*.*.${k}`,
    `body.${k}`,
  ]),
];

/** High-frequency device endpoints log at debug level when they succeed. */
const QUIET_PATHS = new Set(['/api/heartbeat', '/api/sysinfo', '/api/sysinfo_ver']);

export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL'),
      // Accept a sane X-Request-Id from the proxy or generate one; echo it in the response.
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const header = req.headers['x-request-id'];
        const id = typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (QUIET_PATHS.has(path) || path.startsWith('/api/health')) return 'debug';
        return 'info';
      },
      serializers: {
        req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport:
        config.get('NODE_ENV') === 'development'
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l' },
            }
          : undefined,
    },
  };
}
