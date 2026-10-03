import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/** Starts one PostgreSQL for the whole integration run and applies the real migrations. */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('rustdesk_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  globalThis.__PG_CONTAINER__ = container;
  process.env.DATABASE_URL = container.getConnectionUri();

  const root = join(__dirname, '..', '..');
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });
}
