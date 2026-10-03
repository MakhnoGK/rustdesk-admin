import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Provides one PostgreSQL for the whole integration run and applies the real migrations:
 * TEST_DATABASE_URL when set (no Docker needed; the suites TRUNCATE every table, so it must be a
 * dedicated, disposable database), otherwise a Testcontainers PostgreSQL 18.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    const container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('rustdesk_test')
      .withUsername('test')
      .withPassword('test')
      .start();
    globalThis.__PG_CONTAINER__ = container;
    process.env.DATABASE_URL = container.getConnectionUri();
  }

  const root = join(__dirname, '..', '..');
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });
}
