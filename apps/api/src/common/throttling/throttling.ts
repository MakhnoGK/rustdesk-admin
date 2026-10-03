import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AppConfig } from '../../config/app-config.service';

/**
 * Which rate-limit family applies to a route:
 * - `api`: every authenticated RustDesk and admin call, per source IP;
 * - `login`: login endpoints, per source IP and per username;
 * - `device`: unauthenticated device endpoints, per device uuid and (looser) per source IP —
 *   many devices may share one NAT address;
 * - `none`: health checks.
 */
export type RateLimitScope = 'api' | 'login' | 'device' | 'none';

const SCOPE_KEY = 'rate-limit-scope';
export const RateLimit = (scope: RateLimitScope) => SetMetadata(SCOPE_KEY, scope);

function scopeOf(context: ExecutionContext): RateLimitScope {
  const scope =
    (Reflect.getMetadata(SCOPE_KEY, context.getHandler()) as RateLimitScope | undefined) ??
    (Reflect.getMetadata(SCOPE_KEY, context.getClass()) as RateLimitScope | undefined);
  return scope ?? 'api';
}

const onlyFor =
  (...scopes: RateLimitScope[]) =>
  (context: ExecutionContext) =>
    !scopes.includes(scopeOf(context));

function bodyField(req: Request, field: string): string | undefined {
  const body: unknown = req.body;
  if (body && typeof body === 'object' && field in body) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0 && value.length <= 256) return value;
  }
  return undefined;
}

const ipOf = (req: Record<string, unknown>): string => (req as unknown as Request).ip ?? 'unknown';
const ipTracker = (req: Record<string, unknown>): string => ipOf(req);

const MINUTE = 60_000;

/** Throttler configuration. Counters are in memory, i.e. per API instance. */
export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return {
    errorMessage: 'Too many requests, slow down',
    throttlers: [
      {
        name: 'api',
        ttl: MINUTE,
        limit: config.get('RATE_LIMIT_API_PER_MINUTE'),
        skipIf: onlyFor('api'),
        getTracker: ipTracker,
      },
      {
        name: 'login-ip',
        ttl: MINUTE,
        limit: config.get('RATE_LIMIT_LOGIN_PER_MINUTE'),
        skipIf: onlyFor('login'),
        getTracker: ipTracker,
      },
      {
        name: 'login-user',
        ttl: MINUTE,
        limit: config.get('RATE_LIMIT_LOGIN_PER_USERNAME_PER_MINUTE'),
        skipIf: onlyFor('login'),
        getTracker: (req) => {
          const username = bodyField(req as unknown as Request, 'username');
          return username ? `user:${username.toLowerCase()}` : `ip:${ipOf(req)}`;
        },
      },
      {
        name: 'device-ip',
        ttl: MINUTE,
        limit: config.get('RATE_LIMIT_DEVICE_IP_PER_MINUTE'),
        skipIf: onlyFor('device'),
        getTracker: ipTracker,
      },
      {
        name: 'device',
        ttl: MINUTE,
        limit: config.get('RATE_LIMIT_DEVICE_PER_MINUTE'),
        skipIf: onlyFor('device'),
        getTracker: (req) => {
          const uuid = bodyField(req as unknown as Request, 'uuid');
          return uuid ? `uuid:${uuid}` : `ip:${ipOf(req)}`;
        },
      },
    ],
  };
}
