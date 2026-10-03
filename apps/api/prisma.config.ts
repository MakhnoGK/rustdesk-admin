import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Load the repo-level file (and a
// package-level override) when present; real deployments pass env directly.
for (const file of ['../../.env', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Seeds run compiled: Nest DI needs decorator metadata, which tsx/esbuild does not emit.
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    // `prisma generate` does not need a database; migrate/seed commands do.
    url: process.env.DATABASE_URL ?? '',
  },
});
