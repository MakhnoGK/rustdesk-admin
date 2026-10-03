import { NestFactory } from '@nestjs/core';
import { AppConfig } from '../config/app-config.service';
import { UsersService } from '../users/users.service';
import { CommandModule } from './seed.module';

/**
 * Idempotent seed: creates the first administrator from INITIAL_ADMIN_USERNAME /
 * INITIAL_ADMIN_PASSWORD, only when no administrator exists yet.
 */
export async function runSeed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CommandModule, {
    logger: ['error', 'warn'],
  });
  try {
    const config = app.get(AppConfig);
    const username = config.get('INITIAL_ADMIN_USERNAME');
    const password = config.get('INITIAL_ADMIN_PASSWORD');
    if (!username || !password) {
      console.log('Seed: INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD not set, nothing to do.');
      return;
    }
    if (password.length < 12)
      throw new Error('INITIAL_ADMIN_PASSWORD must be at least 12 characters');
    const result = await app.get(UsersService).ensureInitialAdmin(username, password);
    console.log(
      result.created
        ? `Seed: administrator "${result.username}" created.`
        : 'Seed: an administrator already exists, nothing to do.',
    );
  } finally {
    await app.close();
  }
}
