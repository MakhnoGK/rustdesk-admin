import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from './env.schema';

/** Typed, read-only view of the validated environment. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get rustdeskTokenTtlSeconds(): number {
    return this.get('RUSTDESK_TOKEN_TTL_DAYS') * 24 * 60 * 60;
  }

  get adminSessionTtlSeconds(): number {
    return this.get('ADMIN_SESSION_TTL_HOURS') * 60 * 60;
  }

  get swaggerEnabled(): boolean {
    return !this.isProduction || this.get('SWAGGER_ENABLED');
  }
}
