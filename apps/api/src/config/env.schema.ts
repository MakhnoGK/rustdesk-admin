import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters (generate one with: openssl rand -base64 48)`);

const base64Key = z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
  message: 'must be 32 bytes, base64-encoded (generate one with: openssl rand -base64 32)',
});

/** `id:base64key` pairs, comma separated: keys that can still decrypt but no longer encrypt. */
const previousKeys = csv.pipe(
  z.array(
    z.string().refine(
      (pair) => {
        const [id, key] = pair.split(':', 2);
        return (
          !!id &&
          /^[A-Za-z0-9_-]{1,16}$/.test(id) &&
          !!key &&
          Buffer.from(key, 'base64').length === 32
        );
      },
      { message: 'each entry must be <keyId>:<32-byte base64 key>' },
    ),
  ),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: int(21114, 1, 65535),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),

    RUSTDESK_JWT_SECRET: secret('RUSTDESK_JWT_SECRET'),
    RUSTDESK_TOKEN_TTL_DAYS: int(30, 1, 3650),
    ADMIN_JWT_SECRET: secret('ADMIN_JWT_SECRET'),
    ADMIN_SESSION_TTL_HOURS: int(12, 1, 24 * 30),
    ADMIN_ALLOWED_ORIGINS: csv.pipe(z.array(z.url())),
    ADMIN_COOKIE_SECURE: bool(true),

    AB_SECRET_KEY: base64Key,
    AB_SECRET_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,16}$/)
      .default('k1'),
    AB_PREVIOUS_SECRET_KEYS: previousKeys,
    AB_MAX_PEERS: int(0, 0),

    SESSION_TIMEOUT_MINUTES: int(120, 1),
    SESSION_TIMEOUT_CHECK_INTERVAL_SECONDS: int(60, 5),
    HEARTBEAT_GRACE_SECONDS: int(30, 0),
    DEVICE_ONLINE_THRESHOLD_SECONDS: int(45, 1),
    DISCONNECT_TTL_SECONDS: int(120, 10),
    AUDIT_RETENTION_DAYS: int(0, 0),
    STATS_MAX_RANGE_DAYS: int(366, 1, 3660),
    JOBS_ENABLED: bool(true),

    DEVICE_ALLOWED_CIDRS: csv,
    TRUSTED_PROXIES: csv,

    RATE_LIMIT_LOGIN_PER_MINUTE: int(10, 1),
    RATE_LIMIT_LOGIN_PER_USERNAME_PER_MINUTE: int(5, 1),
    RATE_LIMIT_DEVICE_PER_MINUTE: int(120, 1),
    RATE_LIMIT_DEVICE_IP_PER_MINUTE: int(6000, 1),
    RATE_LIMIT_API_PER_MINUTE: int(600, 1),

    SWAGGER_ENABLED: bool(false),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    INITIAL_ADMIN_USERNAME: z.string().optional(),
    INITIAL_ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.RUSTDESK_JWT_SECRET === env.ADMIN_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_JWT_SECRET'],
        message: 'must differ from RUSTDESK_JWT_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses the environment; throws one error that lists every invalid variable. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const name = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  - ${name}: ${issue.message}`;
  });
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}
