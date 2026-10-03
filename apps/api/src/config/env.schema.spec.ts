import { parseEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  RUSTDESK_JWT_SECRET: 'r'.repeat(40),
  ADMIN_JWT_SECRET: 'a'.repeat(40),
  AB_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('parseEnv', () => {
  it('applies documented defaults', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      PORT: 21114,
      RUSTDESK_TOKEN_TTL_DAYS: 30,
      ADMIN_SESSION_TTL_HOURS: 12,
      ADMIN_COOKIE_SECURE: true,
      AB_MAX_PEERS: 0,
      SESSION_TIMEOUT_MINUTES: 120,
      HEARTBEAT_GRACE_SECONDS: 30,
      DEVICE_ONLINE_THRESHOLD_SECONDS: 45,
      DISCONNECT_TTL_SECONDS: 120,
      AUDIT_RETENTION_DAYS: 0,
      DEVICE_ALLOWED_CIDRS: [],
      TRUSTED_PROXIES: [],
      SWAGGER_ENABLED: false,
      LOG_LEVEL: 'info',
    });
  });

  it('lists every invalid variable in one error', () => {
    let message = '';
    try {
      parseEnv({
        PORT: 'x',
        AB_SECRET_KEY: 'short',
        RUSTDESK_JWT_SECRET: 'r'.repeat(40),
        ADMIN_JWT_SECRET: 'a'.repeat(40),
      });
    } catch (e) {
      message = (e as Error).message;
    }
    for (const name of ['PORT', 'DATABASE_URL', 'AB_SECRET_KEY'])
      expect(message).toContain(`- ${name}:`);
    expect(() => parseEnv({ ...valid, ADMIN_JWT_SECRET: valid.RUSTDESK_JWT_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('parses lists and booleans', () => {
    const env = parseEnv({
      ...valid,
      ADMIN_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      ADMIN_COOKIE_SECURE: 'false',
      AB_PREVIOUS_SECRET_KEYS: `k0:${valid.AB_SECRET_KEY}`,
    });
    expect(env.ADMIN_ALLOWED_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.ADMIN_COOKIE_SECURE).toBe(false);
    expect(env.AB_PREVIOUS_SECRET_KEYS).toEqual([`k0:${valid.AB_SECRET_KEY}`]);
    expect(() => parseEnv({ ...valid, AB_PREVIOUS_SECRET_KEYS: 'nokey' })).toThrow(
      /AB_PREVIOUS_SECRET_KEYS/,
    );
  });
});
