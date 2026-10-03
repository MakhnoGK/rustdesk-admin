// Baseline environment for integration tests; individual suites override values through
// createTestApp(overrides). DATABASE_URL comes from the global setup.
Object.assign(process.env, {
  NODE_ENV: 'test',
  RUSTDESK_JWT_SECRET: 'test-rustdesk-jwt-secret-0123456789abcdef',
  ADMIN_JWT_SECRET: 'test-admin-jwt-secret-0123456789abcdef-xyz',
  ADMIN_ALLOWED_ORIGINS: 'http://localhost:5173',
  ADMIN_COOKIE_SECURE: 'true',
  AB_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  JOBS_ENABLED: 'false',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_API_PER_MINUTE: '100000',
  RATE_LIMIT_LOGIN_PER_MINUTE: '100000',
  RATE_LIMIT_LOGIN_PER_USERNAME_PER_MINUTE: '100000',
  RATE_LIMIT_DEVICE_PER_MINUTE: '100000',
  RATE_LIMIT_DEVICE_IP_PER_MINUTE: '100000',
});
