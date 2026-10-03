// Imported first by emit.ts, before the application modules read the environment.
// Placeholders make configuration validation pass; nothing is signed or encrypted with them,
// and the document never depends on the local environment.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:1/openapi',
  RUSTDESK_JWT_SECRET: 'openapi-emit-placeholder-rustdesk-secret-0000',
  ADMIN_JWT_SECRET: 'openapi-emit-placeholder-admin-secret-00000000',
  AB_SECRET_KEY: Buffer.alloc(32).toString('base64'),
  JOBS_ENABLED: 'false',
  LOG_LEVEL: 'silent',
});
